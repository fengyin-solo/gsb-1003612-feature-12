<template>
  <section class="page" data-module="supply">
    <header class="page-head">
      <div>
        <h2>物资储备管理</h2>
        <p class="page-desc">维护防火物资，围绕物资编号、物资名称、物资类别、规格型号做登记、筛选与状态流转；预警台账联动生成核查项。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记防火物资</button>
        <button class="btn" type="button" @click="syncChecks">同步预警核查项</button>
        <button class="btn" type="button" @click="exportRows">导出物资储备清单</button>
      </div>
    </header>

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
      <h3 class="panel-title">物资储备台账</h3>
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
                v-for="action in actions"
                :key="action"
                class="link"
                type="button"
                @click="runAction(action, row)"
              >
                {{ action }}
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 2" class="empty-state">暂无物资储备数据，可先登记防火物资</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h3 class="panel-title">物资储备预警核查台账</h3>
      <p class="panel-tip">
        检查站批次提交后会同步生成核查项；本页面发起补充等动作也会一并生成。
        同一物资、同一来源重复触发只保留一批核查项。
      </p>
      <form class="filter-bar" @submit.prevent>
        <label class="filter-item grow">
          <span>编号检索</span>
          <input v-model="checkQuery" placeholder="可录入核查编号、物资编号、来源编号检索" />
        </label>
      </form>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in checkColumns" :key="column">{{ column }}</th>
            <th>核查状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredChecks" :key="String(row.id)">
            <td v-for="column in checkColumns" :key="column">{{ row[column] ?? '—' }}</td>
            <td>{{ row.status }}</td>
            <td class="row-actions">
              <button
                v-if="String(row.status) === '待核查'"
                class="link"
                type="button"
                @click="finishCheck(row)"
              >
                确认核查
              </button>
              <span v-else class="muted-text">已核查</span>
            </td>
          </tr>
          <tr v-if="!filteredChecks.length">
            <td :colspan="checkColumns.length + 2" class="empty-state">暂无预警核查项，预警物资经补给或检查站批次提交后自动生成</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="page-foot">
      <span>共 {{ total }} 条物资储备记录，核查项 {{ checkRows.length }} 条</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-if="successMessage" class="success-text">{{ successMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
} from '@/api/local-service'
import {
  completeSupplyCheck,
  listSupplyChecks,
  submitSupplyAction,
  syncWarningChecks,
} from '@/api/supply-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('supply')
const columns = ["物资编号", "物资名称", "物资类别", "规格型号", "储备林场", "预警储备量", "实际储备量", "物资状态"]
const checkColumns = ["核查编号", "物资编号", "物资名称", "储备林场", "预警储备量", "实际储备量", "来源", "来源编号", "站点编号", "生成时间", "核查时间", "核查备注"]
const actions = ["发起补充", "确认补充", "标记过期"]
const statuses = ["充足", "偏低", "需补充", "已过期"]

const rows = ref<EntryRow[]>([])
const checkRows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const successMessage = ref('')
const filters = ref<Record<string, string>>({})
const checkQuery = ref('')
const filterFields = columns.slice(0, 3)

const filteredChecks = computed(() => {
  const keyword = checkQuery.value.trim()
  if (keyword === '') {
    return checkRows.value
  }
  return checkRows.value.filter((row) =>
    ["核查编号", "物资编号", "物资名称", "来源", "来源编号", "站点编号"].some((field) =>
      String(row[field] ?? '').includes(keyword),
    ),
  )
})

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const stats = computed(() => [
  { label: "物资种类", value: rows.value.length },
  { label: "需补充种类", value: rows.value.filter((row) => ["偏低", "需补充"].includes(String(row.status))).length },
  { label: "过期种类", value: rows.value.filter((row) => String(row.status) === "已过期").length },
  { label: "待核查项", value: checkRows.value.filter((row) => String(row.status) === "待核查").length },
])

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '防火物资登记入口尚未接入审批流'
  successMessage.value = ''
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  successMessage.value = ''
  // 走补给链路：状态流转成功后，预警台账一并生成核查项。
  const result = submitSupplyAction(Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
  } else {
    successMessage.value =
      result.checksCreated > 0
        ? `${result.message}，预警台账联动生成 ${result.checksCreated} 项核查项`
        : result.message
  }
  reload()
}

function syncChecks() {
  errorMessage.value = ''
  successMessage.value = ''
  const created = syncWarningChecks('预警扫描', '手动扫描')
  successMessage.value =
    created > 0 ? `扫描完成，新生成 ${created} 项预警核查项` : '扫描完成，没有新的预警核查项（重复项已保留一批）'
  reload()
}

function finishCheck(row: EntryRow) {
  errorMessage.value = ''
  successMessage.value = ''
  const result = completeSupplyCheck(Number(row.id))
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  successMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  const payload = listEntries(meta.key, filters.value)
  rows.value = payload.items
  total.value = payload.total
  checkRows.value = listSupplyChecks()
}

onMounted(() => {
  // 首次进入时把种子/历史数据里的预警物资核查项补齐，重复物资只保留一批。
  syncWarningChecks('预警扫描', '页面初始化')
  reload()
})
</script>
