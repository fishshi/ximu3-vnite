import { getDataPath } from './path'
import fse from 'fs-extra'
import log from 'electron-log/main.js'

/**
 * A class to manage the theme of the application
 */
export class ThemeManager {
  private static instance: ThemeManager | null = null
  private themePath: string

  private constructor(themePath: string) {
    this.themePath = themePath
  }

  static async getInstance(): Promise<ThemeManager> {
    if (!ThemeManager.instance) {
      const themePath = await getDataPath('theme.css')
      ThemeManager.instance = new ThemeManager(themePath)
    }
    return ThemeManager.instance
  }

  async saveTheme(cssContent: string): Promise<void> {
    try {
      await fse.writeFile(this.themePath, cssContent, 'utf-8')
    } catch (error) {
      log.error('保存主题失败:', error)
    }
  }

  async loadTheme(): Promise<string | null> {
    try {
      if (await fse.pathExists(this.themePath)) {
        return await fse.readFile(this.themePath, 'utf-8')
      } else {
        return null
      }
    } catch (error) {
      log.error('读取主题失败:', error)
    }
    return null
  }
}
