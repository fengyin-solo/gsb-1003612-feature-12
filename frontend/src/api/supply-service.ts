import { listRows, saveRows } from '@/data/local-store'
import { forestOfSite, nowString } from '@/data/stations'
import { runAction } from './local-service'
import type { ActionResult, EntryRow } from '@/data/types'

// 物资储备预警台账：检查站批次提交与物资页面动作都联动生成核查项。
export const SUPPLY_KEY = 'supply'
export const SUPPLY_CHECK_KEY = 'supplyCheck'

export type CheckSource = '检查站批次' | '物资补给' | '预警扫描'

export type SupplyActionResult = ActionResult & {
  batchNo?: string
  checksCreated: number
  duplicate?: boolean
}

const WARNING_STATUSES = ['偏低', '需补充', '已过期']

function toNumber(value: string | number | boolean | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function nextSerial(rows: EntryRow[]): number {
  return rows.reduce((max, row) => {
    const match = String(row['核查编号'] ?? '').match(/(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
}

function checkSerial(no: number): string {
  return `CHKI-${String(no).padStart(4, '0')}`
}

// 低于预警线，或状态已在预警集合里，都算需要核查。
function isWarning(row: EntryRow): boolean {
  if (WARNING_STATUSES.includes(String(row.status))) {
    return true
  }
  const actual = toNumber(row['实际储备量'] as number)
  const threshold = toNumber(row['预警储备量'] as number)
  return threshold > 0 && actual <= threshold
}

export function listSupplyChecks(): EntryRow[] {
  // 按生成时间倒序，新生成的核查项排在最前。
  return [...listRows(SUPPLY_CHECK_KEY)].sort((a, b) =>
    String(b['生成时间'] ?? '').localeCompare(String(a['生成时间'] ?? '')),
  )
}

function appendCheck(input: {
  supply: EntryRow
  source: CheckSource
  sourceNo: string
  siteCode: string
  generatedAt: string
}): { created: boolean; row?: EntryRow } {
  const rows = listRows(SUPPLY_CHECK_KEY)
  // 同一物资、同一来源、同一来源编号只保留一批核查项；
  // 预警扫描是台账盘点口径，不区分触发入口，同一物资始终只保留一批。
  const dedupeKey =
    input.source === '预警扫描'
      ? `${String(input.supply['物资编号'])}|预警扫描`
      : `${String(input.supply['物资编号'])}|${input.source}|${input.sourceNo}`
  if (rows.some((row) => String(row['去重键']) === dedupeKey)) {
    return { created: false }
  }
  const row: EntryRow = {
    id: nextId(rows),
    status: '待核查',
    pending: true,
    abnormal: false,
    核查编号: checkSerial(nextSerial(rows)),
    物资编号: input.supply['物资编号'],
    物资名称: input.supply['物资名称'],
    储备林场: input.supply['储备林场'],
    预警储备量: input.supply['预警储备量'] as number,
    实际储备量: input.supply['实际储备量'] as number,
    来源: input.source,
    来源编号: input.sourceNo,
    站点编号: input.siteCode,
    生成时间: input.generatedAt,
    核查时间: '',
    核查备注: '',
    去重键: dedupeKey,
  }
  saveRows(SUPPLY_CHECK_KEY, [...rows, row])
  return { created: true, row }
}

// 检查站批次提交后：同步生成该站点归属林场下全部预警物资的核查项。
export function syncChecksForBatch(
  siteCode: string,
  batchNo: string,
  generatedAt: string = nowString(),
): number {
  const forest = forestOfSite(siteCode)
  const warnings = listRows(SUPPLY_KEY).filter(
    (row) => String(row['储备林场'] ?? '') === forest && isWarning(row),
  )
  let created = 0
  for (const supply of warnings) {
    if (appendCheck({ supply, source: '检查站批次', sourceNo: batchNo, siteCode, generatedAt }).created) {
      created += 1
    }
  }
  return created
}

// 对台账现存预警物资做一次扫描：别的页面触发补给动作时，核查项一并生成。
export function syncWarningChecks(source: CheckSource = '预警扫描', sourceNo: string = '台账扫描'): number {
  const generatedAt = nowString()
  let created = 0
  for (const supply of listRows(SUPPLY_KEY)) {
    if (!isWarning(supply)) {
      continue
    }
    const siteCode = siteOfForest(String(supply['储备林场'] ?? ''))
    if (appendCheck({ supply, source, sourceNo, siteCode, generatedAt }).created) {
      created += 1
    }
  }
  return created
}

function siteOfForest(forest: string): string {
  const map: Record<string, string> = {
    青松岭林场: 'CHEC-0001',
    桦树垭林场: 'CHEC-0002',
    红石口林场: 'CHEC-0003',
  }
  return map[forest] ?? ''
}

// 物资页面动作的统一入口：先走原有状态流转，成功后按补给链路联动核查项。
// 被操作物资按「动作」各记一项（发起补充、确认补充、标记过期是不同核查）；
// 其余在库预警物资由台账扫描口径兜底，同一物资始终只保留一批。
export function submitSupplyAction(id: number, action: string): SupplyActionResult {
  const result = runAction(SUPPLY_KEY, id, action)
  if (!result.ok) {
    return { ...result, checksCreated: 0 }
  }
  let created = 0
  const target = listRows(SUPPLY_KEY).find((row) => Number(row.id) === id)
  const generatedAt = nowString()
  if (target) {
    const siteCode = siteOfForest(String(target['储备林场'] ?? ''))
    if (appendCheck({
      supply: target,
      source: '物资补给',
      sourceNo: `${action}#${id}`,
      siteCode,
      generatedAt,
    }).created) {
      created += 1
    }
  }
  created += syncWarningChecks('预警扫描', '台账扫描')
  return { ...result, checksCreated: created }
}

export function completeSupplyCheck(id: number, note: string = '已现场点验，数量与台账一致'): ActionResult {
  const rows = listRows(SUPPLY_CHECK_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: '没有找到这条物资核查项' }
  }
  if (String(rows[index].status) === '已核查') {
    return { ok: false, message: '该核查项已经核查过，无需重复操作' }
  }
  const updated: EntryRow = {
    ...rows[index],
    status: '已核查',
    pending: false,
    核查时间: nowString(),
    核查备注: note,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(SUPPLY_CHECK_KEY, next)
  return { ok: true, message: `核查项 ${String(updated['核查编号'])} 已核查` }
}
