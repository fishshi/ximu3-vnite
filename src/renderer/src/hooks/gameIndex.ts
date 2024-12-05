import { create } from 'zustand'
import { ipcInvoke, ipcOnUnique } from '~/utils'
import { GameIndexdata } from './types'

interface GameIndexManagerState {
  gameIndex: Record<string, Partial<GameIndexdata>>
  search: (query: string) => string[]
  sort: (by: string, order?: 'asc' | 'desc') => string[]
  filter: (criteria: Record<string, string[]>) => string[]
  getAllValuesInKey: (key: string) => string[]
  checkGameExists: (gameId: string) => Promise<boolean>
  setGameIndex: (metadata: Record<string, Partial<GameIndexdata>>) => void
}

// 创建 Zustand store
export const useGameIndexManager = create<GameIndexManagerState>((set, get) => ({
  gameIndex: {},
  // 修改 setGameIndex 以确保安全更新
  setGameIndex: (metadata): void => {
    // 确保 metadata 是有效的对象
    if (metadata && typeof metadata === 'object') {
      set({ gameIndex: { ...metadata } }) // 创建新对象以避免引用问题
      console.log('Game index updated:', metadata)
    } else {
      console.warn('Attempted to set invalid gameIndex:', metadata)
      set({ gameIndex: {} }) // 设置为空对象而不是 null 或 undefined
    }
  },
  search: (query): string[] => {
    const { gameIndex } = get()
    const results: string[] = []
    const lowercaseQuery = query.toLowerCase()
    for (const [gameId, game] of Object.entries(gameIndex)) {
      const matchFound = Object.values(game).some(
        (value) => value && value.toString().toLowerCase().includes(lowercaseQuery)
      )
      if (matchFound) {
        results.push(gameId)
      }
    }
    return results
  },
  sort: (by, order = 'asc'): string[] => {
    const { gameIndex } = get()

    return Object.entries(gameIndex)
      .sort(([, a], [, b]) => {
        const valueA = a[by]
        const valueB = b[by]

        // 检查 valueA 和 valueB 是否为 undefined 或 null
        if (valueA == null && valueB == null) {
          return 0
        }
        if (valueA == null) {
          return order === 'asc' ? 1 : -1
        }
        if (valueB == null) {
          return order === 'asc' ? -1 : 1
        }

        if (valueA === valueB) {
          return 0
        }
        return order === 'asc' ? (valueA > valueB ? 1 : -1) : valueA > valueB ? -1 : 1
      })
      .map(([gameId]) => gameId)
  },
  filter: (criteria): string[] => {
    const { gameIndex } = get()
    const results: string[] = []
    for (const [gameId, game] of Object.entries(gameIndex)) {
      const matchesAllCriteria = Object.entries(criteria).every(([field, values]) => {
        const metadataValue = game[field]
        if (
          field === 'releaseDate' &&
          Array.isArray(values) &&
          values.length === 2 &&
          metadataValue
        ) {
          const [start, end] = values
          const isValidDate = (dateStr: string): boolean => {
            const date = new Date(dateStr)
            return date instanceof Date && !isNaN(date.getTime())
          }
          if (!isValidDate(start) || !isValidDate(end) || !isValidDate(metadataValue.toString())) {
            return false
          }
          const releaseDate = new Date(metadataValue.toString())
          const startDate = new Date(start)
          const endDate = new Date(end)
          if (startDate > endDate) {
            return false
          }
          return releaseDate >= startDate && releaseDate <= endDate
        }
        if (Array.isArray(metadataValue)) {
          return metadataValue.some((item) =>
            values.some((value) => item.toString().toLowerCase().includes(value.toLowerCase()))
          )
        } else if (metadataValue) {
          return values.some((value) =>
            metadataValue.toString().toLowerCase().includes(value.toLowerCase())
          )
        }
        return false
      })
      if (matchesAllCriteria) {
        results.push(gameId)
      }
    }
    return results
  },
  getAllValuesInKey: (key): string[] => {
    const { gameIndex } = get()
    const values = new Set<string>()
    for (const game of Object.values(gameIndex)) {
      const value = game[key]
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item) {
            values.add(item.toString())
          }
        })
      } else if (value) {
        values.add(value.toString())
      }
    }
    return Array.from(values)
  },
  checkGameExists: async (gameId): Promise<boolean> => {
    try {
      const metadata: Record<string, GameIndexdata> = await ipcInvoke('get-games-metadata')
      return metadata[gameId] !== undefined
    } catch (error) {
      console.error('Error checking if game exists:', error)
      throw error
    }
  }
}))

// 初始化游戏索引数据
ipcInvoke('get-games-index')
  .then((metadata) => {
    if (metadata && typeof metadata === 'object') {
      useGameIndexManager
        .getState()
        .setGameIndex(metadata as Record<string, Partial<GameIndexdata>>)
    } else {
      console.error('Invalid initial metadata received:', metadata)
      useGameIndexManager.getState().setGameIndex({})
    }
  })
  .catch((error) => {
    console.error('Failed to initialize game index:', error)
    useGameIndexManager.getState().setGameIndex({})
  })

// 监听游戏索引变化
ipcOnUnique('game-index-changed', () => {
  try {
    ipcInvoke('get-games-index').then((metadata) => {
      if (metadata && typeof metadata === 'object') {
        useGameIndexManager
          .getState()
          .setGameIndex(metadata as Record<string, Partial<GameIndexdata>>)
      } else {
        console.error('Invalid updated metadata received:', metadata)
      }
    })
  } catch (error) {
    console.error('Error handling game-index-changed event:', error)
  }
})
