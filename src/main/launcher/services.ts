import { defaultPreset, lePreset, steamPreset } from './preset'
import { getDBValue } from '../database'
import { fileLuancher, urlLauncher, scriptLauncher } from './common'
import log from 'electron-log/main.js'

export async function launcherPreset(
  presetName: string,
  gameId: string,
  steamId?: string
): Promise<void> {
  try {
    if (presetName === 'default') {
      await defaultPreset(gameId)
    } else if (presetName === 'le') {
      await lePreset(gameId)
    } else if (presetName === 'steam') {
      if (!steamId) {
        throw new Error('Steam ID is required for steam preset')
      }
      await steamPreset(gameId, steamId)
    }
  } catch (error) {
    log.error(`Failed to set preset for ${gameId}`, error)
  }
}

export async function launcher(gameId: string): Promise<void> {
  try {
    const mode = await getDBValue(`games/${gameId}/launcher.json`, ['mode'], '')
    if (mode === 'file') {
      await fileLuancher(gameId)
    } else if (mode === 'url') {
      await urlLauncher(gameId)
    } else if (mode === 'script') {
      await scriptLauncher(gameId)
    }
    log.info(`Launched game ${gameId}`)
  } catch (error) {
    log.error(`Failed to launch game ${gameId}`, error)
  }
}
