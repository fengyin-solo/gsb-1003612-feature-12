<template>
  <section class="page" data-module="checkpoint">
    <header class="page-head">
      <div>
        <h2>防火检查站管理</h2>
        <p class="page-desc">按站点、班次维护检查站台账；值班员可多选本站通行车辆与收缴火种记录，整批升级检查或安排换岗，提交后联动物资储备预警核查项。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记防火检查站</button>
        <button class="btn" type="button" @click="exportRows">导出防火检查站清单</button>
      </div>
    </header>

    <div class="duty-bar">
      <label class="filter-item">
        <span>当前值班站点</span>
        <select v-model="store.stationCode" @change="onStationChange">
          <option v-for="option in store.stationOptions" :key="option.code" :value="option.code">
            {{ option.label }}
          </option>
        </select>
      </label>
      <span class="duty-tip">
        当前值班员：{{ store.operator }}
        <em v-if="!store.isStationOperator" class="readonly-tag">非本站人员只能查看</em>
      </span>
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

    <div class="panel">
      <h3 class="panel-title">检查站班次台账</h3>
      <form class="filter-bar" @submit.prevent="reload">
        <label v-for="field in ledgerFilterFields" :key="field" class="filter-item">
          <span>{{ field }}</span>
          <input v-model="ledgerFilters[field]" :placeholder="`按${field}检索`" />
        </label>
        <button class="btn" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="resetLedgerFilters">重置条件</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in ledgerColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredLedger" :key="String(row.id)">
            <td v-for="column in ledgerColumns" :key="column">
              {{ row[column] ?? '—' }}
              <em v-if="column === '值守人员' && row['回填方式']" class="backfill-tag">按站点回填</em>
            </td>
            <td>{{ row.status }}</td>
            <td class="row-actions">
              <template v-if="canOperateRow(row)">
                <button
                  v-for="action in actions"
                  :key="action"
                  class="link"
                  type="button"
                  @click="runRowAction(action, row)"
                >
                  {{ action }}
                </button>
              </template>
              <span v-else class="muted-text">仅本站可操作</span>
            </td>
          </tr>
          <tr v-if="!filteredLedger.length">
            <td :colspan="ledgerColumns.length + 2" class="empty-state">暂无符合条件的检查站台账记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h3 class="panel-title">班次检查批次</h3>
      <p class="panel-tip">
        勾选范围限定在当前值班站点的同一班次、同一检查日期；不同站点记录不得混入。
        重复提交只保留一批，重复换岗只记一次。
      </p>

      <div v-if="store.isStationOperator" class="batch-scope">
        <label class="filter-item">
          <span>班次</span>
          <select v-model="batchShift" @change="clearSelection">
            <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>检查日期</span>
          <input v-model="batchDate" type="date" />
        </label>
        <label class="filter-item grow">
          <span>编号 / 车牌 / 人员检索</span>
          <input v-model="batchKeyword" placeholder="可录入车辆编号、车牌号码或火种编号检索" />
        </label>
        <button class="btn ghost" type="button" @click="clearScope">清空范围</button>
      </div>

      <p v-if="!store.isStationOperator" class="readonly-banner">
        非本站人员只能查看通行车辆、收缴火种与批次台账，不能整批升级检查或安排换岗。
      </p>

      <template v-else>
        <h4 class="sub-title">本站通行车辆（已多选 {{ selectedVehicles.length }} 辆）</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th class="check-col">选择</th>
              <th v-for="column in vehicleColumns" :key="column">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in candidateVehicles" :key="String(row.id)">
              <td>
                <input
                  type="checkbox"
                  :checked="selectedVehicles.includes(Number(row.id))"
                  :disabled="String(row['登记状态']) !== '待登记'"
                  @change="toggleVehicle(Number(row.id))"
                />
              </td>
              <td v-for="column in vehicleColumns" :key="column">{{ row[column] ?? '—' }}</td>
            </tr>
            <tr v-if="!candidateVehicles.length">
              <td :colspan="vehicleColumns.length + 1" class="empty-state">该班次下暂无通行车辆记录</td>
            </tr>
          </tbody>
        </table>

        <h4 class="sub-title">本站收缴火种（已多选 {{ selectedIgnitions.length }} 条）</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th class="check-col">选择</th>
              <th v-for="column in ignitionColumns" :key="column">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in candidateIgnitions" :key="String(row.id)">
              <td>
                <input
                  type="checkbox"
                  :checked="selectedIgnitions.includes(Number(row.id))"
                  :disabled="String(row['处置状态']) !== '待处置'"
                  @change="toggleIgnition(Number(row.id))"
                />
              </td>
              <td v-for="column in ignitionColumns" :key="column">{{ row[column] ?? '—' }}</td>
            </tr>
            <tr v-if="!candidateIgnitions.length">
              <td :colspan="ignitionColumns.length + 1" class="empty-state">该班次下暂无收缴火种记录</td>
            </tr>
          </tbody>
        </table>

        <div class="batch-actions">
          <button class="btn primary" type="button" @click="submit('升级检查')">整批升级检查</button>
          <button class="btn primary" type="button" @click="submit('安排换岗')">整批安排换岗</button>
          <span class="muted-text">已选车辆 {{ selectedVehicles.length }} 辆 / 火种 {{ selectedIgnitions.length }} 条</span>
        </div>
      </template>
    </div>

    <div class="panel">
      <h3 class="panel-title">检查批次台账（按站点、班次排序定位）</h3>
      <form class="filter-bar" @submit.prevent>
        <label class="filter-item grow">
          <span>批次编号检索</span>
          <input v-model="batchQuery" placeholder="可录入批次编号、车辆或火种编号检索" />
        </label>
      </form>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in batchColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredBatches" :key="String(row.id)">
            <td v-for="column in batchColumns" :key="column">{{ row[column] ?? '—' }}</td>
            <td>{{ row.status }}</td>
          </tr>
          <tr v-if="!filteredBatches.length">
            <td :colspan="batchColumns.length + 1" class="empty-state">暂无检查批次记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="page-foot">
      <span>历史缺少值守人员的记录已按站点回填，旧记录保持原值班日期</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-if="successMessage" class="success-text">{{ successMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  filterRows,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  listBatches,
  listCheckpointLedger,
  listIgnitions,
  listVehicles,
  submitBatch,
} from '@/api/checkpoint-service'
import { useSessionStore } from '@/stores/session'
import { SHIFTS, todayString } from '@/data/stations'
import type { EntryRow } from '@/data/types'

const store = useSessionStore()
const meta = moduleMeta('checkpoint')

const ledgerColumns = ["站点编号", "班次", "站点位置", "值守人员", "检查项目", "通行车辆数", "收缴火种数", "值班日期", "运行状态"]
const vehicleColumns = ["车辆编号", "车牌号码", "检查日期", "驾驶员", "登记状态", "登记编号"]
const ignitionColumns = ["火种编号", "火种类型", "检查日期", "被收缴人", "处置状态", "登记编号"]
const batchColumns = ["批次编号", "站点编号", "站点位置", "班次", "检查日期", "批次动作", "车辆记录数", "火种记录数", "车辆编号列表", "火种编号列表", "提报值班员", "提报时间"]
const actions = ["升级检查", "关闭站点", "安排换岗"]
const statuses = ["正常检查", "临时关闭", "升级检查", "等待换岗"]
const ledgerFilterFields = ["站点编号", "班次", "值守人员"]

const ledgerRows = ref<EntryRow[]>([])
const vehicleRows = ref<EntryRow[]>([])
const ignitionRows = ref<EntryRow[]>([])
const batchRows = ref<EntryRow[]>([])
const errorMessage = ref('')
const successMessage = ref('')

const ledgerFilters = ref<Record<string, string>>({ 站点编号: '', 班次: '', 值守人员: '' })
const batchShift = ref('白班')
const batchDate = ref(todayString())
const batchKeyword = ref('')
const batchQuery = ref('')
const selectedVehicles = ref<number[]>([])
const selectedIgnitions = ref<number[]>([])

const filteredLedger = computed(() => filterRows(ledgerRows.value, ledgerFilters.value))

function inCurrentScope(row: EntryRow): boolean {
  if (!store.isStationOperator || String(row['站点编号']) !== store.stationCode) {
    return false
  }
  if (String(row['班次']) !== batchShift.value) {
    return false
  }
  if (batchDate.value && String(row['检查日期']) !== batchDate.value) {
    return false
  }
  return true
}

const vehicleKeywordFields = ["车辆编号", "车牌号码", "检查日期", "驾驶员"]

const candidateVehicles = computed(() =>
  vehicleRows.value.filter((row) => {
    if (!inCurrentScope(row)) {
      return false
    }
    if (batchKeyword.value.trim() === '') {
      return true
    }
    return vehicleKeywordFields.some((field) =>
      String(row[field] ?? '').includes(batchKeyword.value.trim()),
    )
  }),
)

const candidateIgnitions = computed(() =>
  ignitionRows.value.filter((row) => {
    if (!inCurrentScope(row)) {
      return false
    }
    if (batchKeyword.value.trim() === '') {
      return true
    }
    return ["火种编号", "火种类型", "检查日期", "被收缴人"].some((field) =>
      String(row[field] ?? '').includes(batchKeyword.value.trim()),
    )
  }),
)

const filteredBatches = computed(() => {
  const keyword = batchQuery.value.trim()
  if (keyword === '') {
    return batchRows.value
  }
  return batchRows.value.filter((row) =>
    ["批次编号", "站点编号", "班次", "检查日期", "批次动作", "车辆编号列表", "火种编号列表"].some(
      (field) => String(row[field] ?? '').includes(keyword),
    ),
  )
})

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: ledgerRows.value.filter((row) => String(row.status) === status).length,
  })),
)

const stats = computed(() => {
  const siteCount = new Set(ledgerRows.value.map((row) => String(row['站点编号']))).size
  return [
    { label: '站点总数', value: siteCount },
    { label: '正常检查数', value: ledgerRows.value.filter((row) => String(row.status) === '正常检查').length },
    { label: '收缴火种数', value: ledgerRows.value.reduce((sum, row) => sum + Number(row['收缴火种数'] ?? 0), 0) },
    { label: '检查批次数', value: batchRows.value.length },
  ]
})

function canOperateRow(row: EntryRow): boolean {
  return store.isStationOperator && String(row['站点编号']) === store.stationCode
}

function toggleVehicle(id: number) {
  const exists = selectedVehicles.value.includes(id)
  selectedVehicles.value = exists
    ? selectedVehicles.value.filter((item) => item !== id)
    : [...selectedVehicles.value, id]
}

function toggleIgnition(id: number) {
  const exists = selectedIgnitions.value.includes(id)
  selectedIgnitions.value = exists
    ? selectedIgnitions.value.filter((item) => item !== id)
    : [...selectedIgnitions.value, id]
}

function clearSelection() {
  selectedVehicles.value = []
  selectedIgnitions.value = []
}

function clearScope() {
  batchDate.value = ''
  batchKeyword.value = ''
  clearSelection()
}

function onStationChange() {
  clearSelection()
  successMessage.value = ''
  errorMessage.value = ''
}

function resetLedgerFilters() {
  ledgerFilters.value = { 站点编号: '', 班次: '', 值守人员: '' }
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '防火检查站登记入口尚未接入审批流'
  successMessage.value = ''
}

function runRowAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  successMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  successMessage.value = result.message
  reload()
}

function submit(action: '升级检查' | '安排换岗') {
  errorMessage.value = ''
  successMessage.value = ''
  const result = submitBatch({
    stationCode: store.stationCode,
    operator: store.operator,
    action,
    vehicleIds: selectedVehicles.value,
    ignitionIds: selectedIgnitions.value,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  successMessage.value = result.message
  clearSelection()
  reload()
}

function reload() {
  ledgerRows.value = listCheckpointLedger()
  vehicleRows.value = listVehicles()
  ignitionRows.value = listIgnitions()
  batchRows.value = listBatches()
  // 已被批次挂接的勾选项不再保留。
  const validVehicleIds = new Set(
    vehicleRows.value
      .filter((row) => String(row['登记状态']) === '待登记')
      .map((row) => Number(row.id)),
  )
  const validIgnitionIds = new Set(
    ignitionRows.value
      .filter((row) => String(row['处置状态']) === '待处置')
      .map((row) => Number(row.id)),
  )
  selectedVehicles.value = selectedVehicles.value.filter((id) => validVehicleIds.has(id))
  selectedIgnitions.value = selectedIgnitions.value.filter((id) => validIgnitionIds.has(id))
}

onMounted(reload)
</script>
