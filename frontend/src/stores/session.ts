import { defineStore } from 'pinia'

import { STATIONS } from '@/data/stations'

// 会话里的「当前值班站点」决定能不能在检查站页面提交批次：
// 选了具体站点=本站值班员可操作；选「非本站人员」只能查看。
export const NONE_STATION = ''

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '周建国',
    shiftLabel: '白班 08:00-20:00',
    scope: '森林防火巡护管理系统',
    stationCode: 'CHEC-0001',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
    stationOptions: () => [
      ...STATIONS.map((station) => ({ code: station.code, label: station.name })),
      { code: NONE_STATION, label: '非本站人员（巡查视角）' },
    ],
    currentStation(state) {
      return STATIONS.find((station) => station.code === state.stationCode) ?? null
    },
    // 非本站人员只能查看。
    isStationOperator: (state) => state.stationCode !== NONE_STATION,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setStation(code: string) {
      this.stationCode = code
    },
  },
})
