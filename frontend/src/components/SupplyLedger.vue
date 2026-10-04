<template>
  <section class="ledger" :class="{ embedded: embedded }">
    <header class="ledger-head">
      <div>
        <h3>物资储备预警台账</h3>
        <p class="page-desc">检查站升级检查批次与物资页面动作同步生成核查项，重复提交只保留一条。</p>
      </div>
      <span class="legend-item">待核查：{{ pendingCount }}</span>
    </header>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>录入编号检索</span>
        <input v-model="keyword" placeholder="按核查编号 / 来源单号检索" />
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in visibleRows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td>
            <button
              v-if="String(row.status) === '待核查'"
              class="link"
              type="button"
              :disabled="readonly"
              :title="readonly ? '非本站人员只能查看' : ''"
              @click="finish(row)"
            >
              完成核查
            </button>
            <span v-else class="muted-text">已闭环</span>
          </td>
        </tr>
        <tr v-if="!visibleRows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无核查项，检查站整批升级检查后会同步生成</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>共 {{ visibleRows.length }} 条核查项（按关联林场、生成日期排序）</span>
      <span v-if="readonly" class="error-text">非本站人员只能查看，不能提交核查</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  listCheckItems,
} from '@/api/supply-check'
import { runAction as applyAction } from '@/api/local-service'
import { stationOf } from '@/data/stations'
import type { EntryRow } from '@/data/types'

const props = withDefaults(defineProps<{ stationCode?: string; embedded?: boolean; readonly?: boolean }>(), {
  stationCode: '',
  embedded: true,
  readonly: false,
})
const emit = defineEmits<{ (event: 'changed'): void }>()

const columns = ['核查编号', '来源页面', '来源单号', '关联林场', '核查事项', '生成日期']
const rows = ref<EntryRow[]>([])
const keyword = ref('')

const stationRows = computed(() => {
  const profile = props.stationCode ? stationOf(props.stationCode) : undefined
  if (!profile) return rows.value
  // 检查站页面只看本站点对应林场的核查项，别的站点台账不混入。
  return rows.value.filter((row) => String(row['关联林场']) === profile.储备林场)
})

const visibleRows = computed(() => {
  const key = keyword.value.trim()
  const filtered = key
    ? stationRows.value.filter(
        (row) =>
          String(row['核查编号'] ?? '').includes(key) ||
          String(row['来源单号'] ?? '').includes(key),
      )
    : stationRows.value
  // 按站点（关联林场）定位，同一林场内生成日期倒序，最近的预警在前。
  return [...filtered].sort((a, b) => {
    const forestGap = String(a['关联林场'] ?? '').localeCompare(String(b['关联林场'] ?? ''))
    if (forestGap !== 0) return forestGap
    return String(b['生成日期'] ?? '').localeCompare(String(a['生成日期'] ?? ''))
  })
})

const pendingCount = computed(
  () => stationRows.value.filter((row) => String(row.status) === '待核查').length,
)

function finish(row: EntryRow) {
  // 核查闭环走通用动作机，保持与物资页面动作同一套调用方式。
  applyAction('supply_check', Number(row.id), '完成核查')
  reload()
  emit('changed')
}

function reload() {
  rows.value = listCheckItems()
}

onMounted(reload)
defineExpose({ reload })
</script>
