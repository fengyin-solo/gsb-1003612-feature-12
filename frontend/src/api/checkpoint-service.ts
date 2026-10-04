import { listRows, saveRows } from '@/data/local-store'
import { STATION_BY_CODE, nowString, shiftRank, stationName } from '@/data/stations'
import { syncChecksForBatch } from './supply-service'
import type { ActionResult, EntryRow } from '@/data/types'

// 检查站班次检查批次链路：通行车辆/收缴火种多选 → 整批升级检查或安排换岗 →
// 站点台账回写 → 物资储备预警台账联动核查项。全部记录按站点隔离。

const CHECKPOINT_KEY = 'checkpoint'
const VEHICLE_KEY = 'checkpointVehicle'
const IGNITION_KEY = 'checkpointIgnition'
const BATCH_KEY = 'checkpointBatch'

export type BatchAction = '升级检查' | '安排换岗'
export type BatchResult = ActionResult & {
  batchNo?: string
  checksCreated?: number
  duplicate?: boolean
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function nextBatchSerial(): number {
  const rows = listRows(BATCH_KEY)
  return rows.reduce((max, row) => {
    const match = String(row['批次编号'] ?? '').match(/(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
}

function batchNo(serial: number): string {
  return `BATCH-${String(serial).padStart(4, '0')}`
}

// 站点台账：按站点编号 + 班次 + 值班日期唯一定位一条。
function findLedgerIndex(
  rows: EntryRow[],
  siteCode: string,
  shift: string,
  dutyDate: string,
): number {
  return rows.findIndex(
    (row) =>
      String(row['站点编号']) === siteCode &&
      String(row['班次']) === shift &&
      String(row['值班日期']) === dutyDate,
  )
}

function sortedBySiteShiftDate<T extends EntryRow>(
  rows: T[],
  dateField: '检查日期' | '值班日期',
): T[] {
  // 定位口径：先按站点、再按班次（白班在前）、同班次按日期。
  return [...rows].sort((a, b) => {
    const bySite = String(a['站点编号'] ?? '').localeCompare(String(b['站点编号'] ?? ''))
    if (bySite !== 0) {
      return bySite
    }
    const byShift = shiftRank(String(a['班次'] ?? '')) - shiftRank(String(b['班次'] ?? ''))
    if (byShift !== 0) {
      return byShift
    }
    return String(a[dateField] ?? '').localeCompare(String(b[dateField] ?? ''))
  })
}

export function listCheckpointLedger(): EntryRow[] {
  return sortedBySiteShiftDate(listRows(CHECKPOINT_KEY), '值班日期')
}

export function listVehicles(): EntryRow[] {
  return sortedBySiteShiftDate(listRows(VEHICLE_KEY), '检查日期')
}

export function listIgnitions(): EntryRow[] {
  return sortedBySiteShiftDate(listRows(IGNITION_KEY), '检查日期')
}

export function listBatches(): EntryRow[] {
  // 批次台账：按站点、班次排序定位，同站点同班次里新批次在前。
  return [...listRows(BATCH_KEY)].sort((a, b) => {
    const bySite = String(a['站点编号'] ?? '').localeCompare(String(b['站点编号'] ?? ''))
    if (bySite !== 0) {
      return bySite
    }
    const byShift = shiftRank(String(a['班次'] ?? '')) - shiftRank(String(b['班次'] ?? ''))
    if (byShift !== 0) {
      return byShift
    }
    return String(b['提报时间'] ?? '').localeCompare(String(a['提报时间'] ?? ''))
  })
}

function dedupeKey(action: BatchAction, siteCode: string, shift: string, dutyDate: string): string {
  // 重复换岗只记一次：换岗按「站点 + 班次 + 检查日期」判重，不看勾选明细；
  // 升级检查按「站点 + 班次 + 检查日期 + 勾选记录」判重，重复提交只保留一批。
  if (action === '安排换岗') {
    return `relief|${siteCode}|${shift}|${dutyDate}`
  }
  return `upgrade|${siteCode}|${shift}|${dutyDate}`
}

export type BatchInput = {
  stationCode: string
  operator: string
  action: BatchAction
  vehicleIds: number[]
  ignitionIds: number[]
}

export function submitBatch(input: BatchInput): BatchResult {
  const station = STATION_BY_CODE.get(input.stationCode)
  if (!station) {
    return { ok: false, message: '当前值班站点不在值守名册内，不能整批操作' }
  }
  if (!input.operator.trim()) {
    return { ok: false, message: '缺少本站值班员身份，非本站人员只能查看' }
  }
  if (input.vehicleIds.length === 0 && input.ignitionIds.length === 0) {
    return { ok: false, message: '请先勾选本站的通行车辆或收缴火种记录' }
  }

  const vehicles = listRows(VEHICLE_KEY).filter((row) => input.vehicleIds.includes(Number(row.id)))
  const ignitions = listRows(IGNITION_KEY).filter((row) => input.ignitionIds.includes(Number(row.id)))
  if (vehicles.length !== input.vehicleIds.length || ignitions.length !== input.ignitionIds.length) {
    return { ok: false, message: '勾选的记录有缺失，请刷新后重试' }
  }

  // 不同站点记录不得混入：所有勾选必须来自当前值班站点。
  const foreignSite = [...vehicles, ...ignitions].find(
    (row) => String(row['站点编号']) !== input.stationCode,
  )
  if (foreignSite) {
    return {
      ok: false,
      message: `检测到外站记录（${String(foreignSite['站点编号'])}），不同站点记录不得混入同一批次`,
    }
  }

  // 一个批次只能对应一个班次。
  const shifts = new Set(
    [...vehicles, ...ignitions].map((row) => String(row['班次'] ?? '')),
  )
  if (shifts.size !== 1) {
    return { ok: false, message: '同一批次只能选择一个班次的记录，请按班次分别提交' }
  }
  const shift = [...shifts][0]

  // 一个批次只能落在一个检查日期。
  const dates = new Set(
    [...vehicles, ...ignitions].map((row) => String(row['检查日期'] ?? '')),
  )
  if (dates.size !== 1) {
    return { ok: false, message: '同一批次只能选择同一检查日期的记录' }
  }
  const dutyDate = [...dates][0]

  const idSignature = [
    ...input.vehicleIds.slice().sort((a, b) => a - b).map((id) => `v${id}`),
    ...input.ignitionIds.slice().sort((a, b) => a - b).map((id) => `i${id}`),
  ].join(',')

  const batches = listRows(BATCH_KEY)
  let key = dedupeKey(input.action, input.stationCode, shift, dutyDate)
  if (input.action === '升级检查') {
    key = `${key}|${idSignature}`
  }
  const existed = batches.find((row) => String(row['去重键']) === key)
  if (existed) {
    // 重复提交只保留一批：直接回指已有批次，不再新建。
    return {
      ok: true,
      duplicate: true,
      batchNo: String(existed['批次编号']),
      checksCreated: 0,
      message: `该批次已提交过，重复提交只保留一批：${String(existed['批次编号'])}`,
    }
  }

  const serial = nextBatchSerial()
  const no = batchNo(serial)
  const submittedAt = nowString()

  // 勾选记录挂到批次：火种随批次处置，车辆只做登记挂接（放行结果不变）。
  const nextVehicles = [...listRows(VEHICLE_KEY)]
  for (const vehicle of vehicles) {
    const index = nextVehicles.findIndex((row) => Number(row.id) === Number(vehicle.id))
    nextVehicles[index] = {
      ...nextVehicles[index],
      登记编号: no,
      登记状态: '已登记',
      status: '已登记',
      pending: false,
    }
  }
  saveRows(VEHICLE_KEY, nextVehicles)

  const nextIgnitions = [...listRows(IGNITION_KEY)]
  for (const ignition of ignitions) {
    const index = nextIgnitions.findIndex((row) => Number(row.id) === Number(ignition.id))
    nextIgnitions[index] = {
      ...nextIgnitions[index],
      登记编号: no,
      处置状态: '已处置',
      status: '已处置',
      pending: false,
    }
  }
  saveRows(IGNITION_KEY, nextIgnitions)

  // 站点台账回写：同站点同班次同日期聚合到一条，没有就新建；旧记录日期不动。
  const ledgers = listRows(CHECKPOINT_KEY)
  const ledgerIndex = findLedgerIndex(ledgers, input.stationCode, shift, dutyDate)
  const vehicleCount = vehicles.length
  const ignitionCount = ignitions.length
  const targetStatus = input.action === '升级检查' ? '升级检查' : '等待换岗'
  if (ledgerIndex >= 0) {
    const current = ledgers[ledgerIndex]
    ledgers[ledgerIndex] = {
      ...current,
      status: targetStatus,
      pending: targetStatus !== '等待换岗',
      运行状态: targetStatus,
      通行车辆数: toFiniteNumber(current['通行车辆数']) + vehicleCount,
      收缴火种数: toFiniteNumber(current['收缴火种数']) + ignitionCount,
    }
    saveRows(CHECKPOINT_KEY, ledgers)
  } else {
    const created: EntryRow = {
      id: nextId(ledgers),
      status: targetStatus,
      pending: true,
      abnormal: false,
      站点编号: input.stationCode,
      班次: shift,
      站点位置: stationName(input.stationCode),
      值守人员: station.officers[0],
      检查项目: '入山车辆、人员及火种检查',
      通行车辆数: vehicleCount,
      收缴火种数: ignitionCount,
      值班日期: dutyDate,
      运行状态: targetStatus,
    }
    saveRows(CHECKPOINT_KEY, [...ledgers, created])
  }

  const record: EntryRow = {
    id: nextId(batches),
    status: targetStatus,
    pending: targetStatus !== '等待换岗',
    abnormal: false,
    批次编号: no,
    站点编号: input.stationCode,
    站点位置: stationName(input.stationCode),
    班次: shift,
    检查日期: dutyDate,
    批次动作: input.action,
    车辆记录数: vehicleCount,
    火种记录数: ignitionCount,
    车辆编号列表: vehicles.map((row) => String(row['车辆编号'])).join('、'),
    火种编号列表: ignitions.map((row) => String(row['火种编号'])).join('、'),
    提报值班员: input.operator,
    提报时间: submittedAt,
    去重键: key,
  }
  saveRows(BATCH_KEY, [...batches, record])

  // 提交后物资储备预警台账同步生成核查项（同批重复物资核查项也只生成一批）。
  const checksCreated = syncChecksForBatch(input.stationCode, no, submittedAt)

  return {
    ok: true,
    batchNo: no,
    checksCreated,
    message:
      `批次 ${no} 已${input.action}，挂接通行车辆 ${vehicleCount} 辆、收缴火种 ${ignitionCount} 条` +
      (checksCreated > 0 ? `，并同步生成 ${checksCreated} 项物资核查项` : '，当前无预警物资核查项'),
  }
}

function toFiniteNumber(value: string | number | boolean | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
