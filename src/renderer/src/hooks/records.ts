import { useState, useEffect, useCallback, useMemo } from 'react'
import { ipcInvoke, ipcOnUnique } from '~/utils'

// 定义类型
interface Record {
  playingTime: number
  timer: {
    start: string
    end: string
  }[]
}

interface MaxPlayTimeDay {
  date: string
  playingTime: number
}

interface GameRecords {
  [gameId: string]: Record
}

interface GameRecordsHook {
  gameRecords: GameRecords
  getGamePlayingTime: (gameId: string) => number
  getGamePlayingTimeFormatted: (gameId: string) => string
  getGamePlayTimeByDateRange: (
    gameId: string,
    startDate: string,
    endDate: string
  ) => { [date: string]: number }
  getGamePlayDays: (gameId: string) => number
  getGameMaxPlayTimeDay: (gameId: string) => MaxPlayTimeDay | null
  getGameRecord: (gameId: string) => Record
  getGameStartAndEndDate: (gameId: string) => { start: string; end: string }
  getSortedGameIds: (order: 'asc' | 'desc') => string[]
  getMaxOrdinalGameId: () => string | null
  getPlayedDaysYearly: () => { [date: string]: number }
  getTotalPlayingTimeYearly: () => number
  getTotalPlayingTime: number
  getTotalPlayedTimes: number
  getTotalPlayedDays: number
  getSortedGameByPlayedTimes: (order: 'asc' | 'desc') => string[]
}

// 自定义 Hook
export const useGameRecords = (): GameRecordsHook => {
  const [gameRecords, setGameRecords] = useState<GameRecords>({})

  // 获取计时器数据的函数
  const fetchRecords = useCallback(async (): Promise<void> => {
    try {
      const records = (await ipcInvoke('get-games-record-data')) as GameRecords
      setGameRecords(records)
    } catch (error) {
      console.error('Failed to fetch games records:', error)
    }
  }, [])

  useEffect(() => {
    // 初始化时获取数据
    fetchRecords()

    // 监听更新信号
    const handleRecordUpdate = (): void => {
      fetchRecords()
    }

    // 注册 IPC 监听器
    const removeListener = ipcOnUnique('record-update', handleRecordUpdate)

    // 清理函数
    return (): void => {
      removeListener()
    }
  }, [fetchRecords])

  const getGamePlayingTime = useCallback(
    (gameId: string): number => {
      return gameRecords[gameId]?.playingTime || 0
    },
    [gameRecords]
  )

  const getGamePlayingTimeFormatted = useCallback(
    (gameId: string): string => {
      const playingTime = getGamePlayingTime(gameId)
      const hours = Math.floor(playingTime / 3600000)
      const minutes = Math.floor((playingTime % 3600000) / 60000)
      const seconds = Math.floor((playingTime % 60000) / 1000)

      if (hours >= 1) {
        const fractionalHours = (playingTime / 3600000).toFixed(1)
        return `${fractionalHours} h`
      } else if (minutes >= 1) {
        return `${minutes} min`
      } else {
        return `${seconds} s`
      }
    },
    [getGamePlayingTime]
  )

  interface DailyPlayTime {
    [date: string]: number
  }

  const calculateDailyPlayTime = (date: Date, record: Record): number => {
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    if (!record.timer || record.timer.length === 0) {
      return 0
    }

    return record.timer.reduce((totalPlayTime, timer) => {
      const timerStart = new Date(timer.start)
      const timerEnd = new Date(timer.end)

      if (timerStart <= dayEnd && timerEnd >= dayStart) {
        const overlapStart = Math.max(dayStart.getTime(), timerStart.getTime())
        const overlapEnd = Math.min(dayEnd.getTime(), timerEnd.getTime())
        return totalPlayTime + (overlapEnd - overlapStart)
      }

      return totalPlayTime
    }, 0)
  }

  // 使用 calculateDailyPlayTime 函数来计算日期范围内的游玩时间
  const getGamePlayTimeByDateRange = useCallback(
    (gameId: string, startDate: string, endDate: string): DailyPlayTime => {
      const gameRecord = gameRecords[gameId]
      if (!gameRecord?.timer || gameRecord?.timer.length === 0) {
        return {}
      }

      const start = new Date(startDate)
      const end = new Date(endDate)
      const result: DailyPlayTime = {}
      const current = new Date(start)

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0]
        // 直接使用指定游戏的计时器数据
        const dayPlayTime = calculateDailyPlayTime(current, gameRecord)
        result[dateStr] = dayPlayTime
        current.setDate(current.getDate() + 1)
      }

      return result
    },
    [gameRecords]
  )

  const getGamePlayDays = useCallback(
    (gameId: string): number => {
      const gameRecord = gameRecords[gameId]
      if (!gameRecord?.timer || gameRecord?.timer.length === 0) {
        return 0
      }

      // 使用 Set 来存储不重复的日期
      const playDays = new Set<string>()

      gameRecord.timer.forEach((timer) => {
        // 获取开始时间的日期部分
        const startDay = timer.start.split('T')[0]
        // 获取结束时间的日期部分
        const endDay = timer.end.split('T')[0]

        // 如果开始和结束是同一天，只添加一次
        if (startDay === endDay) {
          playDays.add(startDay)
        } else {
          // 如果跨天，需要计算中间的所有天数
          const start = new Date(timer.start)
          const end = new Date(timer.end)
          const current = new Date(start)

          // 设置时间为当天开始
          current.setHours(0, 0, 0, 0)

          // 遍历所有涉及的天数
          while (current <= end) {
            playDays.add(current.toISOString().split('T')[0])
            current.setDate(current.getDate() + 1)
          }
        }
      })

      return playDays.size
    },
    [gameRecords]
  )

  const getGameMaxPlayTimeDay = useCallback(
    (gameId: string): MaxPlayTimeDay | null => {
      const gameRecord = gameRecords[gameId]
      if (!gameRecord?.timer || gameRecord?.timer.length === 0) {
        return null
      }

      // 获取所有游戏记录的日期范围
      const allDates = new Set<string>()
      gameRecord.timer.forEach((timer) => {
        const start = new Date(timer.start)
        const end = new Date(timer.end)
        const current = new Date(start)

        while (current <= end) {
          allDates.add(current.toISOString().split('T')[0])
          current.setDate(current.getDate() + 1)
        }
      })

      // 使用 calculateDailyPlayTime 计算每天的游玩时间
      let maxDate = ''
      let maxTime = 0

      allDates.forEach((dateStr) => {
        const currentDate = new Date(dateStr)
        const playTime = calculateDailyPlayTime(currentDate, gameRecord)

        if (playTime > maxTime) {
          maxDate = dateStr
          maxTime = playTime
        }
      })

      if (maxDate === '') {
        return null
      }

      return {
        date: maxDate,
        playingTime: maxTime
      }
    },
    [gameRecords]
  )

  const getGameRecord = useCallback(
    (gameId: string): Record => {
      return gameRecords[gameId] || []
    },
    [gameRecords]
  )

  const getGameStartAndEndDate = useCallback(
    (gameId: string): { start: string; end: string } => {
      const gameRecord = gameRecords[gameId]
      if (!gameRecord?.timer || gameRecord?.timer.length === 0) {
        return { start: '', end: '' }
      }

      const formatDate = (date: Date): string => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const start = new Date(gameRecord.timer[0].start)
      const end = new Date(gameRecord.timer[gameRecord.timer.length - 1].end)

      return {
        start: formatDate(start),
        end: formatDate(end)
      }
    },
    [gameRecords]
  )

  const getSortedGameIds = useCallback(
    (order: 'asc' | 'desc'): string[] => {
      return Object.keys(gameRecords).sort((a, b) => {
        const timeA = getGamePlayingTime(a)
        const timeB = getGamePlayingTime(b)

        if (timeA < timeB) {
          return order === 'asc' ? -1 : 1
        } else if (timeA > timeB) {
          return order === 'asc' ? 1 : -1
        }

        return 0
      })
    },
    [gameRecords, getGamePlayingTime]
  )

  interface PlayedDaysYearly {
    [date: string]: number
  }

  const getPlayedDaysYearly = useCallback((): PlayedDaysYearly => {
    const currentDate = new Date()
    const lastYearDate = new Date(currentDate)
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1)

    const result: PlayedDaysYearly = {}
    const current = new Date(currentDate)

    // 收集所有日期的数据
    const datesArray: { date: string; playTime: number }[] = []

    while (current.getTime() >= lastYearDate.getTime()) {
      const dateStr = current.toISOString().split('T')[0]

      const playTime = Object.values(gameRecords).reduce((total, record) => {
        return total + calculateDailyPlayTime(current, record)
      }, 0)

      // 将日期和游玩时间保存到数组中
      datesArray.push({
        date: dateStr,
        playTime: playTime
      })

      current.setDate(current.getDate() - 1)
    }

    // 按日期排序（从早到晚）
    datesArray.sort((a, b) => a.date.localeCompare(b.date))

    // 转换为最终的对象格式
    datesArray.forEach(({ date, playTime }) => {
      result[date] = playTime
    })

    return result
  }, [gameRecords])

  const getTotalPlayingTimeYearly = useCallback((): number => {
    const currentDate = new Date()
    const lastYearDate = new Date(currentDate)
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1)

    const current = new Date(currentDate)
    let totalPlayTime = 0

    while (current.getTime() >= lastYearDate.getTime()) {
      const playTime = Object.values(gameRecords).reduce((total, record) => {
        return total + calculateDailyPlayTime(current, record)
      }, 0)

      totalPlayTime += playTime

      current.setDate(current.getDate() - 1)
    }

    return totalPlayTime
  }, [gameRecords])

  const getMaxOrdinalGameId = useCallback((): string | null => {
    // 获取游玩次数最多的游戏 ID
    let maxPlayedTimes = 0
    let maxOrdinalGameId: null | string = null

    for (const [gameId, record] of Object.entries(gameRecords)) {
      if (record.timer && record.timer.length > maxPlayedTimes) {
        maxPlayedTimes = record.timer.length
        maxOrdinalGameId = gameId
      }
    }

    return maxOrdinalGameId
  }, [gameRecords])

  const getTotalPlayingTime = useMemo((): number => {
    return Object.values(gameRecords).reduce((total, record) => {
      return total + record.playingTime
    }, 0)
  }, [gameRecords])

  const getTotalPlayedTimes = useMemo((): number => {
    // 获取总游玩次数，既所有计时器的数量
    return Object.values(gameRecords).reduce((total, record) => {
      if (record.timer) {
        return total + record.timer.length
      } else {
        return total
      }
    }, 0)
  }, [gameRecords])

  const getTotalPlayedDays = useMemo((): number => {
    // 获取总游玩天数
    return Object.keys(gameRecords).reduce((total, gameId) => {
      return total + getGamePlayDays(gameId)
    }, 0)
  }, [gameRecords, getGamePlayDays])

  const getSortedGameByPlayedTimes = useCallback(
    (order: 'asc' | 'desc'): string[] => {
      return Object.keys(gameRecords).sort((a, b) => {
        const ordinalA = gameRecords[a]?.timer?.length || 0
        const ordinalB = gameRecords[b]?.timer?.length || 0

        if (ordinalA < ordinalB) {
          return order === 'asc' ? -1 : 1
        } else if (ordinalA > ordinalB) {
          return order === 'asc' ? 1 : -1
        }

        return 0
      })
    },
    [gameRecords]
  )

  return useMemo(
    () => ({
      gameRecords,
      getGamePlayingTime,
      getGamePlayingTimeFormatted,
      getGamePlayTimeByDateRange,
      getGamePlayDays,
      getGameMaxPlayTimeDay,
      getGameRecord,
      getGameStartAndEndDate,
      getSortedGameIds,
      getMaxOrdinalGameId,
      getPlayedDaysYearly,
      getTotalPlayingTimeYearly,
      getTotalPlayingTime,
      getTotalPlayedTimes,
      getTotalPlayedDays,
      getSortedGameByPlayedTimes
    }),
    [
      gameRecords,
      getGamePlayingTime,
      getGamePlayingTimeFormatted,
      getGamePlayTimeByDateRange,
      getGamePlayDays,
      getGameMaxPlayTimeDay,
      getGameRecord,
      getGameStartAndEndDate,
      getSortedGameIds,
      getMaxOrdinalGameId,
      getPlayedDaysYearly,
      getTotalPlayingTimeYearly,
      getTotalPlayingTime,
      getTotalPlayedTimes,
      getTotalPlayedDays,
      getSortedGameByPlayedTimes
    ]
  )
}
