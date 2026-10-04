<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">森林防火巡护管理系统</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向森林火险监测、巡护任务调度、防火设施维护与应急响应指挥的林区防火管理平台。</span>
        <span class="head-user">
          <label class="head-select">
            身份
            <select v-model="identity" @change="applyIdentity">
              <option value="CHEC-0001">张建国 · 青峰岭检查站</option>
              <option value="CHEC-0002">李秀英 · 东卡口检查站</option>
              <option value="CHEC-0003">赵永强 · 南坡检查站</option>
              <option value="outsider">非本站人员（只读）</option>
            </select>
          </label>
          <label class="head-select">
            查看站点
            <select :value="store.activeStation" @change="changeStation($event)">
              <option v-for="station in store.stationProfiles" :key="station.站点编号" :value="station.站点编号">
                {{ station.站点位置 }}
              </option>
            </select>
          </label>
          <label class="head-select">
            班次
            <select :value="store.shiftLabel" @change="store.setShift(($event.target as HTMLSelectElement).value)">
              <option v-for="label in shiftLabels" :key="label" :value="label">{{ label }}</option>
            </select>
          </label>
          <span class="head-badge" :class="{ readonly: !store.isOwnStation }">
            当前值班：{{ store.operator }} · {{ store.shiftName }}{{ store.isOwnStation ? '' : '（只读）' }}
          </span>
        </span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { SHIFT_LABELS, STATION_MAP } from '@/data/stations'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()
const shiftLabels = SHIFT_LABELS
const identity = ref(store.stationCode || 'outsider')

function applyIdentity() {
  if (identity.value === 'outsider') {
    store.setOutsider()
    return
  }
  const profile = STATION_MAP.get(identity.value)
  if (!profile) return
  store.operator = profile.值守人员
  store.stationCode = profile.站点编号
  store.activeStation = profile.站点编号
}

function changeStation(event: Event) {
  store.setActiveStation((event.target as HTMLSelectElement).value)
}

const navItems = [{ label: "运营概览", path: "/" }, { label: "巡护任务", path: "/patrol" }, { label: "火险监测", path: "/firewatch" }, { label: "瞭望台管理", path: "/lookout" }, { label: "防火隔离带", path: "/firebreak" }, { label: "扑火队伍", path: "/fireteam" }, { label: "消防装备", path: "/equipment" }, { label: "气象观测", path: "/weather" }, { label: "火情报告", path: "/firereport" }, { label: "无人机巡查", path: "/drone" }, { label: "防火宣传", path: "/campaign" }, { label: "防火检查站", path: "/checkpoint" }, { label: "值勤排班", path: "/duty" }, { label: "物资储备", path: "/supply" }, { label: "林区道路", path: "/forestroad" }, { label: "防火林带", path: "/firebelt" }, { label: "应急演练", path: "/drill" }, { label: "焚烧审批", path: "/burnpermit" }, { label: "林木生长", path: "/treegrowth" }]
</script>
