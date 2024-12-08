import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupIPC } from './ipc'
import log from 'electron-log/main.js'
import { getLogsPath } from './utils'
import { setupWatcher, stopWatcher } from './watcher'
import {
  setupProtocols,
  setupTempDirectory,
  setupOpenAtLogin,
  setupTray,
  TrayManager,
  parseGameIdFromUrl
} from './utils'
import { initializeCloudsyncServices } from './cloudSync'
import { setupUpdater } from './updater'
import { initScraper } from './scraper'
import { initializeIndex } from './database/gameIndex'
import { initializeRecords } from './database/record'
import { getDBValue } from '~/database'

let mainWindow: BrowserWindow
let splashWindow: BrowserWindow | null

export let trayManager: TrayManager

log.initialize()

log.transports.file.resolvePathFn = (): string => getLogsPath()

let launchGameId: string | null = null
const args = process.argv
const deepLinkUrl = args.find((arg) => arg.startsWith('vnite://'))
if (deepLinkUrl) {
  launchGameId = parseGameIdFromUrl(deepLinkUrl)
}

async function handleGameUrl(url: string): Promise<void> {
  try {
    const gameId = parseGameIdFromUrl(url)
    if (!gameId) {
      console.error('Invalid game URL format')
      return
    }

    console.log('Launching game with ID:', gameId)

    if (mainWindow) {
      // 确保窗口可见
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      mainWindow.focus()

      const gamePath = await getDBValue(`games/${gameId}/path.json`, ['gamePath'], '')
      const mode = await getDBValue(`games/${gameId}/launcher.json`, ['mode'], '')
      const config = await getDBValue(`games/${gameId}/launcher.json`, [`${mode}Config`], {})
      mainWindow.webContents.send('start-game-from-url', gameId, gamePath, mode, config)
    } else {
      launchGameId = gameId
    }
  } catch (error) {
    console.error('Error handling game URL:', error)
  }
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1600,
    minHeight: 900,
    show: false,
    frame: false,
    icon: icon,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  setupIPC(mainWindow)

  mainWindow.once('ready-to-show', () => {
    // 设置固定延时
    setTimeout(async () => {
      if (splashWindow) {
        splashWindow.destroy()
        splashWindow = null
      }
      mainWindow.show()
      if (launchGameId) {
        const gamePath = await getDBValue(`games/${launchGameId}/path.json`, ['gamePath'], '')
        const mode = await getDBValue(`games/${launchGameId}/launcher.json`, ['mode'], '')
        const config = await getDBValue(
          `games/${launchGameId}/launcher.json`,
          [`${mode}Config`],
          {}
        )
        mainWindow.webContents.send('start-game-from-url', launchGameId, gamePath, mode, config)
        launchGameId = null
      }
    }, 7000)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 300,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  splashWindow.on('closed', () => {
    splashWindow = null
  })

  // 加载启动屏页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    splashWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`)
  } else {
    splashWindow.loadFile(join(__dirname, '../renderer/splash.html'))
  }

  splashWindow.once('ready-to-show', () => {
    splashWindow && splashWindow.show()
  })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果不是第一个实例，直接退出
  app.quit()
} else {
  // 处理第二个实例的启动
  app.on('second-instance', (_event, commandLine) => {
    // 如果主窗口存在，激活它
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()

      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }

      // 临时置顶以引起注意
      mainWindow.setAlwaysOnTop(true)
      setTimeout(() => {
        mainWindow.setAlwaysOnTop(false)
      }, 300)
    }

    // 检查是否有协议 URL
    const url = commandLine.find((arg) => arg.startsWith('vnite://'))
    if (url) {
      // 处理协议 URL
      handleGameUrl(url)
    }
  })
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('vnite')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))

    // Initialize metadata
    await initializeIndex()

    // Initialize records
    await initializeRecords()

    setupProtocols()

    createWindow()

    createSplashWindow()

    // Setup tray
    trayManager = await setupTray(mainWindow)

    // Watch for changes in the data directory
    await setupWatcher(mainWindow)

    // Setup temporary directory
    await setupTempDirectory()

    // Setup open at login
    await setupOpenAtLogin()

    // Initialize cloud sync services
    await initializeCloudsyncServices(mainWindow)

    // Setup auto updater
    setupUpdater(mainWindow)

    // Initialize the scraper
    initScraper()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      stopWatcher()
      trayManager.destroy()
      app.quit()
    }
  })

  // In this file you can include the rest of your app"s specific main process
  // code. You can also put them in separate files and require them here.
}
