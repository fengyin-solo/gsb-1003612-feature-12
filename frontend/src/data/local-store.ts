import { SEED_ROWS } from './seed'
import { stationOf } from './stations'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'forest-fire-patrol:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 历史数据迁移：老批次只有站点没有班次、值守人员。
// 按站点回填（站点档案里的固定值守人员），班次缺失补「白班」，值班日期一律保持原值不动。
function migrate(legacy: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const checkpointRows = legacy['checkpoint']
  if (Array.isArray(checkpointRows)) {
    legacy['checkpoint'] = checkpointRows.map((row) => {
      const next: EntryRow = { ...row }
      const station = stationOf(String(next['站点编号'] ?? ''))
      if (!next['班次'] || String(next['班次']).trim() === '') {
        next['班次'] = '白班'
      }
      if (!next['值守人员'] || String(next['值守人员']).includes('样例')) {
        next['值守人员'] = station?.值守人员 ?? '站点值守员'
      }
      if ((!next['站点位置'] || String(next['站点位置']).includes('样例')) && station) {
        next['站点位置'] = station.站点位置
      }
      return next
    })
  }
  return legacy
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = migrate(JSON.parse(raw) as Record<string, EntryRow[]>)
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
