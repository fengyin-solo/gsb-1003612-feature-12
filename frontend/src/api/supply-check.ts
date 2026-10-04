import { listRows, saveRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

// 物资储备预警核查台账：检查站批次提交与别的页面上的物资动作都汇总到这里。
// 台账只增不删，按「来源页面 + 来源单号 + 核查事项」去重，重复触发只保留一条。
export const SUPPLY_CHECK_KEY = 'supply_check'

const PAGE_CHECKPOINT = '防火检查站'
const PAGE_SUPPLY = '物资储备'

export type CheckItemInput = {
  来源页面: string
  来源单号: string
  关联林场: string
  核查事项: string
  生成日期: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function listCheckItems(): EntryRow[] {
  return listRows(SUPPLY_CHECK_KEY)
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function sameItem(a: EntryRow, input: CheckItemInput): boolean {
  return (
    String(a['来源页面']) === input.来源页面 &&
    String(a['来源单号']) === input.来源单号 &&
    String(a['核查事项']) === input.核查事项
  )
}

// 幂等写入：已存在同来源、同单号、同事项的核查项时直接返回旧的那一条，不重复生成。
export function upsertCheckItem(input: CheckItemInput): { row: EntryRow; duplicated: boolean } {
  const rows = listCheckItems()
  const existing = rows.find((row) => sameItem(row, input))
  if (existing) {
    return { row: existing, duplicated: true }
  }
  const id = nextId(rows)
  const row: EntryRow = {
    id,
    status: '待核查',
    pending: true,
    abnormal: false,
    核查编号: `CHK-${String(id).padStart(4, '0')}`,
    ...input,
    核查状态: '待核查',
  }
  saveRows(SUPPLY_CHECK_KEY, [...rows, row])
  return { row, duplicated: false }
}

export function completeCheckItem(id: number): EntryRow | undefined {
  const rows = listCheckItems()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return undefined
  }
  const updated: EntryRow = {
    ...rows[index],
    status: '已核查',
    pending: false,
    核查状态: '已核查',
  }
  const next = [...rows]
  next[index] = updated
  saveRows(SUPPLY_CHECK_KEY, next)
  return updated
}

// 检查站「升级检查」批次提交后沿链路同步生成核查项。
// 只对本站点对应林场下储备偏低/需补充/已过期的物资生成预警项；没有预警物资时生成一条综合核查项。
export function createCheckpointBatchCheckItem(input: {
  batchCode: string
  forest: string
  date: string
  supplies: EntryRow[]
}): { row: EntryRow; duplicated: boolean } {
  const warningSupplies = input.supplies.filter((row) =>
    ['偏低', '需补充', '已过期'].includes(String(row.status)),
  )
  if (warningSupplies.length === 0) {
    return upsertCheckItem({
      来源页面: PAGE_CHECKPOINT,
      来源单号: input.batchCode,
      关联林场: input.forest,
      核查事项: '升级检查批次联动：核查灭火器具、防火宣传物资储备与补给',
      生成日期: input.date,
    })
  }
  const names = warningSupplies.map((row) => String(row['物资名称'])).join('、')
  return upsertCheckItem({
    来源页面: PAGE_CHECKPOINT,
    来源单号: input.batchCode,
    关联林场: input.forest,
    核查事项: `升级检查批次联动：${names}储备预警，需尽快补给`,
    生成日期: input.date,
  })
}

// 物资页面（以及别的页面调用物资动作时）联动：同一物资同一动作只生成一条核查项。
export function createSupplyActionCheckItem(input: {
  supply: EntryRow
  action: string
}): { row: EntryRow; duplicated: boolean } {
  const code = String(input.supply['物资编号'] ?? '')
  return upsertCheckItem({
    来源页面: PAGE_SUPPLY,
    来源单号: code,
    关联林场: String(input.supply['储备林场'] ?? ''),
    核查事项: `${input.action}：${String(input.supply['物资名称'] ?? '')}（编号 ${code}）`,
    生成日期: today(),
  })
}
