// 检查站站点档案：站点编号、位置、对应补给林场、固定值守人员都在这里登记。
// 历史记录缺少值守人员时按站点回填（站点固定值守人员），不同站点的记录各自归属。
export type StationProfile = {
  站点编号: string
  站点位置: string
  储备林场: string
  值守人员: string
}

export const STATION_PROFILES: StationProfile[] = [
  { 站点编号: 'CHEC-0001', 站点位置: '青峰岭检查站', 储备林场: '青峰林场', 值守人员: '张建国' },
  { 站点编号: 'CHEC-0002', 站点位置: '东卡口检查站', 储备林场: '东卡林场', 值守人员: '李秀英' },
  { 站点编号: 'CHEC-0003', 站点位置: '南坡检查站', 储备林场: '南坡林场', 值守人员: '赵永强' },
]

export const STATION_MAP: Map<string, StationProfile> = new Map(
  STATION_PROFILES.map((item) => [item.站点编号, item]),
)

export function stationOf(code: string): StationProfile | undefined {
  return STATION_MAP.get(code)
}

// 林场反查站点：物资储备一侧只有「储备林场」，沿林场找回对应检查站。
export function stationByForest(forest: string): StationProfile | undefined {
  return STATION_PROFILES.find((item) => item.储备林场 === forest)
}

export function stationOrder(code: string): number {
  const index = STATION_PROFILES.findIndex((item) => item.站点编号 === code)
  return index < 0 ? STATION_PROFILES.length : index
}

// 班次固定两班：按「班次与站点排序定位」时需要确定先后。
export const SHIFT_ORDER = ['白班', '夜班'] as const

export function shiftNameOf(label: string): string {
  return label.includes('夜') ? '夜班' : '白班'
}

export function shiftOrder(name: string): number {
  const index = SHIFT_ORDER.indexOf(name as (typeof SHIFT_ORDER)[number])
  return index < 0 ? SHIFT_ORDER.length : index
}

export const SHIFT_LABELS = ['白班 08:00-20:00', '夜班 20:00-08:00']
