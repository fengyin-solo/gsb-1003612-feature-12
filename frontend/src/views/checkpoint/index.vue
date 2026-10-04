<template>
  <section class="page" data-module="checkpoint">
    <header class="page-head">
      <div>
        <h2>防火检查站管理</h2>
        <p class="page-desc">值班员多选本站通行车辆和收缴火种记录，整批升级检查或安排换岗；不同站点记录不得混入，提交后联动物资储备补给。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出防火检查站清单</button>
      </div>
    </header>

    <div class="context-bar" :class="{ readonly: !canWrite }">
      <span>
        当前查看：<strong>{{ activeProfile?.站点位置 ?? '全部站点' }}</strong>
        （{{ activeStation || '未指定站点' }}）· 班次 <strong>{{ store.shiftName }}</strong>
      </span>
      <span v-if="canWrite">提交人：{{ store.operator }}，可对本站 {{ store.shiftName }} 记录整批操作</span>
      <span v-else class="error-text">非本站人员只能查看，不能勾选提交或执行动作</span>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              class="link"
              type="button"
              :disabled="!canWrite"
              :title="canWrite ? '' : '非本站人员只能查看'"
              @click="runAction('关闭站点', row)"
            >
              关闭站点
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无符合条件的检查站记录</td>
        </tr>
      </tbody>
    </table>

    <section class="batch-panel">
      <header class="panel-head">
        <h3>班次检查批次 · {{ activeProfile?.站点位置 ?? '' }} {{ store.shiftName }}</h3>
        <div class="batch-toolbar">
          <label class="filter-item">
            <span>录入编号检索</span>
            <input v-model="batchKeyword" placeholder="按批次编号检索，如 BATCH-20261004-02" @keyup.enter="locateBatch" />
          </label>
          <button class="btn" type="button" @click="locateBatch">定位批次</button>
          <button class="btn primary" type="button" :disabled="!canWrite" @click="submitBatch('升级检查')">
            整批升级检查（{{ selectedVehicles.length + selectedFires.length }}）
          </button>
          <button class="btn" type="button" :disabled="!canWrite" @click="submitBatch('安排换岗')">
            安排换岗（{{ selectedVehicles.length + selectedFires.length }}）
          </button>
        </div>
      </header>

      <div class="record-grid">
        <div class="record-col">
          <h4>本站通行车辆（仅 {{ store.shiftName }} 可勾选）</h4>
          <label class="filter-item compact">
            <span>车辆编号检索</span>
            <input v-model="vehicleKeyword" placeholder="如 VEH-0003 / 车牌号" />
          </label>
          <table class="data-table compact-table">
            <thead>
              <tr><th>选择</th><th v-for="col in vehicleColumns" :key="col">{{ col }}</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredVehicles"
                :key="String(row.id)"
                :class="{ located: locatedId === String(row.id) }"
              >
                <td>
                  <input
                    v-model="selectedVehicles"
                    type="checkbox"
                    :value="Number(row.id)"
                    :disabled="!canSelect(row)"
                    :title="canSelect(row) ? '' : '非本站当前班次或已纳入批次'"
                  />
                </td>
                <td v-for="col in vehicleColumns" :key="col">{{ row[col] ?? '—' }}</td>
                <td>{{ row.status }}</td>
              </tr>
              <tr v-if="!filteredVehicles.length">
                <td :colspan="vehicleColumns.length + 2" class="empty-state">本站当前班次暂无可选车辆记录</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="record-col">
          <h4>收缴火种记录（仅 {{ store.shiftName }} 可勾选）</h4>
          <label class="filter-item compact">
            <span>火种编号检索</span>
            <input v-model="fireKeyword" placeholder="如 FIREKIND-0002" />
          </label>
          <table class="data-table compact-table">
            <thead>
              <tr><th>选择</th><th v-for="col in fireColumns" :key="col">{{ col }}</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredFires"
                :key="String(row.id)"
                :class="{ located: locatedId === String(row.id) }"
              >
                <td>
                  <input
                    v-model="selectedFires"
                    type="checkbox"
                    :value="Number(row.id)"
                    :disabled="!canSelect(row)"
                    :title="canSelect(row) ? '' : '非本站当前班次或已纳入批次'"
                  />
                </td>
                <td v-for="col in fireColumns" :key="col">{{ row[col] ?? '—' }}</td>
                <td>{{ row.status }}</td>
              </tr>
              <tr v-if="!filteredFires.length">
                <td :colspan="fireColumns.length + 2" class="empty-state">本站当前班次暂无可选火种记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p v-if="batchHint" class="batch-hint">{{ batchHint }}</p>

      <h4>已提交批次（按站点、班次、日期排序）</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in batchColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in batches"
            :key="String(row.id)"
            :class="{ located: locatedBatchCode === String(row['批次编号']) }"
          >
            <td v-for="column in batchColumns" :key="column">{{ row[column] ?? '—' }}</td>
            <td>{{ row.status }}</td>
          </tr>
          <tr v-if="!batches.length">
            <td :colspan="batchColumns.length + 1" class="empty-state">暂无班次检查批次</td>
          </tr>
        </tbody>
      </table>
    </section>

    <SupplyLedger ref="ledgerRef" :station-code="activeStation" :readonly="!canWrite" @changed="reloadAll" />

    <footer class="page-foot">
      <span>共 {{ total }} 条检查站记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  listBatches,
  listFires,
  listVehicles,
  sortByStationShiftDate,
  submitInspectionBatch,
} from '@/api/checkpoint-batch'
import SupplyLedger from '@/components/SupplyLedger.vue'
import { stationOf } from '@/data/stations'
import { useSessionStore } from '@/stores/session'
import type { EntryRow } from '@/data/types'

const store = useSessionStore()
const meta = moduleMeta('checkpoint')
const columns = ['站点编号', '站点位置', '班次', '值守人员', '检查项目', '通行车辆数', '收缴火种数', '值班日期', '运行状态']
const vehicleColumns = ['车辆编号', '检查日期', '车牌号码', '驾驶员', '登记人数', '检查结果']
const fireColumns = ['火种编号', '收缴日期', '火种类型', '数量', '来源车牌', '收缴人']
const batchColumns = ['批次编号', '站点编号', '班次', '检查日期', '批次动作', '车辆记录数', '火种记录数', '提交人']
const statuses = ['正常检查', '临时关闭', '升级检查', '等待换岗']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ['站点编号', '站点位置', '班次', '值守人员']

const vehicles = ref<EntryRow[]>([])
const fires = ref<EntryRow[]>([])
const batches = ref<EntryRow[]>([])
const selectedVehicles = ref<number[]>([])
const selectedFires = ref<number[]>([])
const vehicleKeyword = ref('')
const fireKeyword = ref('')
const batchKeyword = ref('')
const batchHint = ref('')
const locatedBatchCode = ref('')
const locatedId = ref('')
const ledgerRef = ref<InstanceType<typeof SupplyLedger>>()

const activeStation = computed(() => store.activeStation)
const activeProfile = computed(() =>
  activeStation.value ? stationOf(activeStation.value) : undefined,
)
// 非本站人员只能查看；本站值班员切到别的站点也是只读。
const canWrite = computed(() => store.isOwnStation)

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const stats = computed(() => [
  { label: '站点总数', value: new Set(rows.value.map((row) => String(row['站点编号']))).size },
  { label: '正常检查数', value: rows.value.filter((row) => String(row.status) === '正常检查').length },
  { label: '收缴火种数', value: sumField(rows.value, '收缴火种数') },
  { label: '待核查批次', value: batches.value.filter((row) => String(row.status) === '待核查').length },
])

function sumField(list: EntryRow[], field: string): number {
  return list.reduce((sum, row) => sum + (Number(row[field]) || 0), 0)
}

// 可勾选记录限定：属于当前查看站点、当前班次，且未纳入其它批次。
function canSelect(row: EntryRow): boolean {
  if (!canWrite.value) return false
  return (
    String(row['站点编号']) === activeStation.value &&
    String(row['班次']) === store.shiftName &&
    String(row.status) !== '已纳入批次'
  )
}

const selectableVehicles = computed(() =>
  vehicles.value.filter(
    (row) =>
      String(row['站点编号']) === activeStation.value &&
      String(row['班次']) === store.shiftName,
  ),
)

const selectableFires = computed(() =>
  fires.value.filter(
    (row) =>
      String(row['站点编号']) === activeStation.value &&
      String(row['班次']) === store.shiftName,
  ),
)

const filteredVehicles = computed(() => {
  const key = vehicleKeyword.value.trim()
  const matched = key
    ? selectableVehicles.value.filter((row) =>
        [String(row['车辆编号']), String(row['车牌号码']), String(row['驾驶员'])].some((value) =>
          value.includes(key),
        ),
      )
    : selectableVehicles.value
  return sortByStationShiftDate(matched)
})

const filteredFires = computed(() => {
  const key = fireKeyword.value.trim()
  const matched = key
    ? selectableFires.value.filter((row) =>
        [String(row['火种编号']), String(row['来源车牌']), String(row['火种类型'])].some((value) =>
          value.includes(key),
        ),
      )
    : selectableFires.value
  return sortByStationShiftDate(matched)
})

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function runAction(action: string, row: EntryRow) {
  if (!canWrite.value) {
    errorMessage.value = '非本站人员只能查看，不能执行动作'
    return
  }
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  errorMessage.value = result.ok ? '' : result.message
  reloadAll()
}

function submitBatch(action: string) {
  errorMessage.value = ''
  batchHint.value = ''
  if (!canWrite.value) {
    errorMessage.value = '非本站人员只能查看，不能提交批次'
    return
  }
  const result = submitInspectionBatch({
    station: activeStation.value,
    shift: store.shiftName,
    action,
    operator: store.operator,
    vehicleIds: selectedVehicles.value,
    fireIds: selectedFires.value,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  batchHint.value = result.duplicated ? result.message : result.message
  selectedVehicles.value = []
  selectedFires.value = []
  reloadAll()
}

// 按录入编号定位：批次编号或车辆/火种编号命中后高亮对应行。
function locateBatch() {
  const key = batchKeyword.value.trim()
  locatedBatchCode.value = ''
  locatedId.value = ''
  if (!key) return
  const batch = batches.value.find((row) => String(row['批次编号']).includes(key))
  if (batch) {
    locatedBatchCode.value = String(batch['批次编号'])
    batchHint.value = `已定位批次 ${locatedBatchCode.value}：${String(batch['站点编号'])} ${String(batch['班次'])} ${String(batch['检查日期'])}`
    return
  }
  const vehicle = vehicles.value.find((row) =>
    [String(row['车辆编号']), String(row['车牌号码'])].some((value) => value.includes(key)),
  )
  if (vehicle) {
    locatedId.value = String(vehicle.id)
    vehicleKeyword.value = String(vehicle['车辆编号'])
    batchHint.value = `编号 ${key} 命中通行车辆记录`
    return
  }
  const fire = fires.value.find((row) => String(row['火种编号']).includes(key))
  if (fire) {
    locatedId.value = String(fire.id)
    fireKeyword.value = String(fire['火种编号'])
    batchHint.value = `编号 ${key} 命中收缴火种记录`
  }
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = sortByStationShiftDate(payload.items)
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '防火检查站列表读取失败'
  }
}

function reloadRecords() {
  vehicles.value = sortByStationShiftDate(listVehicles())
  fires.value = sortByStationShiftDate(listFires())
  batches.value = listBatches()
  ledgerRef.value?.reload()
}

function reloadAll() {
  reload()
  reloadRecords()
}

// 切换站点或班次后，清掉不属于当前站点班次的勾选，保证不同站点记录不混入，并刷新列表。
watch([activeStation, () => store.shiftName], () => {
  const allowedVehicles = new Set(selectableVehicles.value.map((row) => Number(row.id)))
  const allowedFires = new Set(selectableFires.value.map((row) => Number(row.id)))
  selectedVehicles.value = selectedVehicles.value.filter((id) => allowedVehicles.has(id))
  selectedFires.value = selectedFires.value.filter((id) => allowedFires.has(id))
  vehicleKeyword.value = ''
  fireKeyword.value = ''
  locatedBatchCode.value = ''
  locatedId.value = ''
  reload()
})

onMounted(reloadAll)
</script>
