import { listRows, saveRows } from '@/data/local-store'
import { shiftOrder, stationOf, stationOrder } from '@/data/stations'
import type { BatchSubmitInput, BatchSubmitResult, EntryRow } from '@/data/types'
import { createCheckpointBatchCheckItem } from '@/api/supply-check'

// 检查站 -> 物资储备补给的链路都收敛在这个文件里：批次多选、去重、站点/班次隔离、台账联动。
export const VEHICLE_KEY = 'checkpoint_vehicle'
export const FIRE_KEY = 'checkpoint_fire'
export const BATCH_KEY = 'checkpoint_batch'

export const BATCH_ACTIONS = ['升级检查', '安排换岗'] as const
const SELECTABLE_VEHICLE_STATUS = ['待检查', '已放行']
const SELECTABLE_FIRE_STATUS = ['待处置', '已上交']

// 按站点、再按班次（白班在前夜班在后）定位；同一站点班次内检查日期倒序，最近批次在前。
export function sortByStationShiftDate(rows: EntryRow[]): EntryRow[] {
  return [...rows].sort((a, b) => {
    const stationGap =
      stationOrder(String(a['站点编号'] ?? '')) - stationOrder(String(b['站点编号'] ?? ''))
    if (stationGap !== 0) return stationGap
    const shiftGap = shiftOrder(String(a['班次'] ?? '')) - shiftOrder(String(b['班次'] ?? ''))
    if (shiftGap !== 0) return shiftGap
    return String(b['检查日期'] ?? b['值班日期'] ?? '').localeCompare(
      String(a['检查日期'] ?? a['值班日期'] ?? ''),
    )
  })
}

export function listVehicles(): EntryRow[] {
  return listRows(VEHICLE_KEY)
}

export function listFires(): EntryRow[] {
  return listRows(FIRE_KEY)
}

export function listBatches(): EntryRow[] {
  return sortByStationShiftDate(listRows(BATCH_KEY))
}

function nextBatchCode(rows: EntryRow[], date: string): string {
  const day = date.replace(/-/g, '')
  const prefix = `BATCH-${day}-`
  const maxSeq = rows.reduce((max, row) => {
    const code = String(row['批次编号'] ?? '')
    if (!code.startsWith(prefix)) return max
    return Math.max(max, Number(code.slice(prefix.length)) || 0)
  }, 0)
  return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`
}

function pickDate(records: EntryRow[]): string {
  const dates = new Set(records.map((row) => String(row['检查日期'] ?? row['收缴日期'] ?? '')))
  return dates.size === 1 ? [...dates][0] : new Date().toISOString().slice(0, 10)
}

function selectedRecords(ids: number[], rows: EntryRow[]): EntryRow[] {
  return ids
    .map((id) => rows.find((row) => Number(row.id) === id))
    .filter((row): row is EntryRow => Boolean(row))
}

// 整批提交：
// 1) 车辆与火种记录必须全部归属同一个站点、同一个班次（不同站点记录不得混入）；
// 2) 同站点 + 同班次 + 同日期 + 同动作只保留一批，重复提交返回已有批次；
// 3) 升级检查联动生成物资储备预警核查项，安排换岗不生成物资项（重复换岗只记一次）。
export function submitInspectionBatch(input: BatchSubmitInput): BatchSubmitResult {
  const vehicleRows = listVehicles()
  const fireRows = listFires()
  const vehicles = selectedRecords(input.vehicleIds, vehicleRows)
  const fires = selectedRecords(input.fireIds, fireRows)

  if (vehicles.length === 0 && fires.length === 0) {
    return { ok: false, message: '请至少勾选一条本站通行车辆或收缴火种记录' }
  }

  const records = [...vehicles, ...fires]
  const station = stationOf(input.station)
  if (!station) {
    return { ok: false, message: `未登记的检查站：${input.station}` }
  }

  const foreign = records.find((row) => String(row['站点编号']) !== input.station)
  if (foreign) {
    return {
      ok: false,
      message: `不同站点的记录不得混入：${String(foreign['车辆编号'] ?? foreign['火种编号'])}不属于本站`,
    }
  }
  const otherShift = records.find((row) => String(row['班次']) !== input.shift)
  if (otherShift) {
    return {
      ok: false,
      message: `勾选记录必须属于同一班次：${String(otherShift['车辆编号'] ?? otherShift['火种编号'])}不是${input.shift}`,
    }
  }
  const usedVehicle = vehicles.find(
    (row) => !SELECTABLE_VEHICLE_STATUS.includes(String(row.status)),
  )
  if (usedVehicle) {
    return { ok: false, message: `车辆 ${String(usedVehicle['车辆编号'])} 已纳入其它批次，不能重复勾选` }
  }
  const usedFire = fires.find((row) => !SELECTABLE_FIRE_STATUS.includes(String(row.status)))
  if (usedFire) {
    return { ok: false, message: `火种 ${String(usedFire['火种编号'])} 已纳入其它批次，不能重复勾选` }
  }

  const date = pickDate(records)

  // 重复提交只保留一批：同站点、班次、日期、动作已有批次时直接返回旧批次。
  const batchRows = listRows(BATCH_KEY)
  const duplicate = batchRows.find(
    (row) =>
      String(row['站点编号']) === input.station &&
      String(row['班次']) === input.shift &&
      String(row['检查日期']) === date &&
      String(row['批次动作']) === input.action,
  )
  if (duplicate) {
    return {
      ok: true,
      duplicated: true,
      batch: duplicate,
      message: `${input.action}批次已存在（${String(duplicate['批次编号'])}），重复提交只保留一批`,
    }
  }

  const batchId = batchRows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const batchCode = nextBatchCode(batchRows, date)
  const batch: EntryRow = {
    id: batchId,
    status: '待核查',
    pending: true,
    abnormal: false,
    批次编号: batchCode,
    站点编号: input.station,
    班次: input.shift,
    检查日期: date,
    批次动作: input.action,
    车辆记录数: vehicles.length,
    火种记录数: fires.length,
    提交人: input.operator,
    车辆明细: vehicles.map((row) => String(row['车辆编号'])).join('、'),
    火种明细: fires.map((row) => String(row['火种编号'])).join('、'),
    批次状态: '待核查',
  }
  saveRows(BATCH_KEY, [...batchRows, batch])

  // 勾选记录整批关联到批次，状态置为「已纳入批次」，后续不能再被重复勾选。
  const markBatch = (rows: EntryRow[], picked: EntryRow[]) =>
    rows.map((row) =>
      picked.some((item) => Number(item.id) === Number(row.id))
        ? { ...row, status: '已纳入批次', pending: false, 关联批次: batchCode }
        : row,
    )
  saveRows(VEHICLE_KEY, markBatch(vehicleRows, vehicles))
  saveRows(FIRE_KEY, markBatch(fireRows, fires))

  // 联动更新本站点对应班次、日期的检查站记录：升级检查/等待换岗。
  upsertCheckpointRow(input.station, input.shift, date, input.action, vehicles.length, fires.length)

  let checkItem: EntryRow | undefined
  if (input.action === '升级检查') {
    // 沿检查站动作 -> 物资储备补给链路，同步生成预警台账核查项。
    const result = createCheckpointBatchCheckItem({
      batchCode,
      forest: station.储备林场,
      date,
      supplies: listRows('supply'),
    })
    checkItem = result.row
  }

  return {
    ok: true,
    batch,
    checkItem,
    message:
      input.action === '升级检查'
        ? `${input.station} ${input.shift} 已整批升级检查（${batchCode}），物资储备预警台账已同步生成核查项${checkItem ? ` ${String(checkItem['核查编号'])}` : ''}`
        : `${input.station} ${input.shift} 换岗批次已登记（${batchCode}），重复换岗只记一次`,
  }
}

// 检查站主表按站点 + 班次 + 日期 upsert：存在就更新计数与状态，不存在就补一条，旧记录日期不动。
function upsertCheckpointRow(
  stationCode: string,
  shift: string,
  date: string,
  action: string,
  vehicleCount: number,
  fireCount: number,
): void {
  const profile = stationOf(stationCode)
  const rows = listRows('checkpoint')
  const targetStatus = action === '升级检查' ? '升级检查' : '等待换岗'
  const index = rows.findIndex(
    (row) =>
      String(row['站点编号']) === stationCode &&
      String(row['班次'] ?? '白班') === shift &&
      String(row['值班日期']) === date,
  )
  if (index >= 0) {
    const current = rows[index]
    rows[index] = {
      ...current,
      status: targetStatus,
      pending: true,
      通行车辆数: Number(current['通行车辆数'] ?? 0) + vehicleCount,
      收缴火种数: Number(current['收缴火种数'] ?? 0) + fireCount,
      运行状态: targetStatus,
    }
    saveRows('checkpoint', [...rows])
    return
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const row: EntryRow = {
    id,
    status: targetStatus,
    pending: true,
    abnormal: false,
    站点编号: stationCode,
    站点位置: profile?.站点位置 ?? stationCode,
    班次: shift,
    值守人员: profile?.值守人员 ?? '站点值守员',
    检查项目: '通行车辆、火种收缴',
    通行车辆数: vehicleCount,
    收缴火种数: fireCount,
    值班日期: date,
    运行状态: targetStatus,
  }
  saveRows('checkpoint', [...rows, row])
}
