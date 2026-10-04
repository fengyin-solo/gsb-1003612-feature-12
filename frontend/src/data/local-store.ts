import { SEED_ROWS } from './seed'
import { DEFAULT_SHIFT, backfillDutyOfficer } from './stations'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'forest-fire-patrol:entries'
// 结构调整过一次：加了版本封套，旧版（直接存 Record）读到也要能平滑迁移。
const STORAGE_VERSION = 2

type StoreEnvelope = {
  version: number
  rows: Record<string, EntryRow[]>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 老数据结构升级到当前版本：
// - 检查站台账补「班次」（历史缺班次归白班）；
// - 缺少值守人员的历史记录按站点回填，旧记录保持原值班日期，并在记录上标注回填方式。
function migrate(raw: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const next = clone(raw)
  const checkpoint = next['checkpoint']
  if (Array.isArray(checkpoint)) {
    next['checkpoint'] = checkpoint.map((row) => {
      const migrated: EntryRow = { ...row }
      if (String(migrated['班次'] ?? '').trim() === '') {
        migrated['班次'] = DEFAULT_SHIFT
      }
      if (String(migrated['值守人员'] ?? '').trim() === '') {
        migrated['值守人员'] = backfillDutyOfficer(String(migrated['站点编号'] ?? ''))
        migrated['回填方式'] = '按站点回填'
        // 只补人、不动日期：值班日期沿用原检查日期。
      }
      return migrated
    })
  }
  return next
}

function buildSeed(): Record<string, EntryRow[]> {
  return migrate(clone(SEED_ROWS))
}

function parseStorage(raw: string): Record<string, EntryRow[]> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]> | StoreEnvelope
    if (parsed && Array.isArray((parsed as StoreEnvelope).rows)) {
      const envelope = parsed as StoreEnvelope
      return envelope.version >= STORAGE_VERSION
        ? envelope.rows
        : migrate(envelope.rows)
    }
    if (parsed && typeof parsed === 'object') {
      // 旧版本地数据：没有版本封套，直接是模块字典。
      return migrate(parsed as Record<string, EntryRow[]>)
    }
  } catch {
    // 解析失败则回退到示例数据
  }
  return null
}

function readStorage(): Record<string, EntryRow[]> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return buildSeed()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = buildSeed()
    persist(seed)
    return seed
  }
  const migrated = parseStorage(raw)
  if (migrated) {
    const merged = { ...buildSeed(), ...migrated }
    persist(merged)
    return merged
  }
  const seed = buildSeed()
  persist(seed)
  return seed
}

function persist(rows: Record<string, EntryRow[]>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    const envelope: StoreEnvelope = { version: STORAGE_VERSION, rows }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
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
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = migrate(clone({ [key]: SEED_ROWS[key] ?? [] }))[key]
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
