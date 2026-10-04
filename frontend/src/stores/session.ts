import { defineStore } from 'pinia'

import { STATION_PROFILES, shiftNameOf } from '@/data/stations'

// 当前值班身份：operator 固定对应一个检查站；「非本站人员」用空站点表示，只能查看。
// 值班管理员可在页头切换正在操作的检查站与班次，但操作权限始终绑定本人所属站点。
export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '张建国',
    stationCode: 'CHEC-0001',
    activeStation: 'CHEC-0001',
    shiftLabel: '白班 08:00-20:00',
    scope: '森林防火巡护管理系统',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
    shiftName: (state) => shiftNameOf(state.shiftLabel),
    // 当前查看的检查站是否是本人所属站点：非本站（含非本站人员）一律只读。
    isOwnStation(state): boolean {
      return state.stationCode !== '' && state.activeStation === state.stationCode
    },
    stationProfiles: () => STATION_PROFILES,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setActiveStation(code: string) {
      this.activeStation = code
    },
    // 切换为「非本站人员」：可浏览全部站点记录，但任何提交、动作都不可用。
    setOutsider() {
      this.operator = '非本站巡查员'
      this.stationCode = ''
      this.activeStation = ''
    },
  },
})
