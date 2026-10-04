// 检查站值守名册：站点、归属林场与固定值守人员都登记在这里。
// 历史记录缺少值守人员时按站点回填（班次只是时间切片，人员跟着站点走）。

export type StationInfo = {
  code: string
  name: string
  forest: string
  officers: string[]
}

export const STATIONS: StationInfo[] = [
  { code: 'CHEC-0001', name: '青松岭检查站', forest: '青松岭林场', officers: ['周建国', '李振东'] },
  { code: 'CHEC-0002', name: '桦树垭检查站', forest: '桦树垭林场', officers: ['王海涛', '刘春梅'] },
  { code: 'CHEC-0003', name: '红石口检查站', forest: '红石口林场', officers: ['赵铁生', '孙长河'] },
]

export const STATION_BY_CODE: Map<string, StationInfo> = new Map(
  STATIONS.map((item) => [item.code, item]),
)

// 检查站台账新增「班次」列后，历史记录没有班次的统一归到白班。
export const DEFAULT_SHIFT = '白班'
export const SHIFTS = ['白班', '夜班']

export function shiftRank(shift: string): number {
  const index = SHIFTS.indexOf(shift)
  return index < 0 ? SHIFTS.length : index
}

export function stationName(code: string): string {
  return STATION_BY_CODE.get(code)?.name ?? code
}

export function forestOfSite(code: string): string {
  return STATION_BY_CODE.get(code)?.forest ?? ''
}

// 历史缺少值守人员时的回填口径：按站点取名册首位值守人员。
export function backfillDutyOfficer(code: string): string {
  return STATION_BY_CODE.get(code)?.officers[0] ?? '待分配值守人员'
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function todayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function nowString(): string {
  const now = new Date()
  return `${todayString()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}
