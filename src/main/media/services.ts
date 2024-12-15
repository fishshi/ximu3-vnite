import {
  getMediaPath,
  setMediaWithFile,
  setMediaWithUrl,
  detectSourceType,
  saveFileIcon,
  checkIconExists
} from './common'
import { BrowserWindow } from 'electron'
import log from 'electron-log/main.js'

/**
 * Get the media path for a game
 * @param gameId The id of the game
 * @param type The type of media
 * @returns The path to the media
 */
export async function getMedia(
  gameId: string,
  type: 'cover' | 'background' | 'icon'
): Promise<string> {
  try {
    return await getMediaPath(gameId, type)
  } catch (error) {
    log.error('Failed to get media', {
      gameId,
      type,
      error
    })
    return ''
  }
}

/**
 * Set the media for a game
 * @param gameId The id of the game
 * @param type The type of media
 * @param source The source of the media
 * @returns A promise that resolves when the operation is complete.
 * @throws An error if the operation fails.
 */
export async function setMedia(
  gameId: string,
  type: 'cover' | 'background' | 'icon',
  source: string
): Promise<void> {
  try {
    const sourceType = await detectSourceType(source)

    switch (sourceType) {
      case 'url':
        await setMediaWithUrl(gameId, type, source)
        break
      case 'file':
        await setMediaWithFile(gameId, type, source)
        break
      default:
        throw new Error(`Invalid source type: ${source}`)
    }
    const mainWindow = BrowserWindow.getAllWindows()[0]
    mainWindow.webContents.send('reload-db-values', `games/${gameId}/${type}`)
  } catch (error) {
    log.error('Failed to set media', {
      gameId,
      type,
      source,
      error
    })
    throw error
  }
}

/**
 * Save the icon for a game
 * @param gameId The id of the game
 * @param filePath The path to the icon
 * @returns A promise that resolves when the operation is complete.
 * @throws An error if the operation fails.
 */
export async function saveIcon(gameId: string, filePath: string): Promise<void> {
  try {
    await saveFileIcon(gameId, filePath)
    const mainWindow = BrowserWindow.getAllWindows()[0]
    mainWindow.webContents.send('reload-db-values', `games/${gameId}/icon`)
  } catch (error) {
    log.error('Failed to save icon', {
      gameId,
      filePath,
      error
    })
    throw error
  }
}

/**
 * Check if the icon exists for a game
 * @param gameId The id of the game
 * @returns A promise that resolves with a boolean indicating if the icon exists.
 */
export async function checkIcon(gameId: string): Promise<boolean> {
  try {
    return await checkIconExists(gameId)
  } catch (error) {
    log.error('Failed to check icon', {
      gameId,
      error
    })
    return false
  }
}
