import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { addNewGameToData, getGameData, updateGameData, deleteGame } from '../renderer/src/components/dataManager.mjs'
import { organizeGameData, searchGameNamebyId, organizeGameDataEmpty, updateGameMetaData } from "../renderer/src/components/scraper.mjs"
import { spawn, execFile } from 'child_process';
import sharp from 'sharp';
import fs from 'fs/promises';
import fse from 'fs-extra';
import { getConfigData, updateConfigData } from '../renderer/src/components/configManager.mjs';
import { startAuthProcess, initializeRepo, commitAndPush, createWebDavClient, uploadDirectory, downloadDirectory, initAndPushLocalRepo, clonePrivateRepo, pullChanges } from '../renderer/src/components/cloudSync.mjs';
import getFolderSize from "get-folder-size";
import path from 'path';
import log from 'electron-log/main.js';
import axios from 'axios';
import semver from 'semver';
import { initData } from '../../scripts/update-json.mjs';
import util from 'util';
import { getCategoryData, deleteGameFromAllCategories, updateCategoryData, addNewCategory, addNewGameToCategory, deleteCategory, deleteGameFromCategory, moveCategoryUp, moveCategoryDown, moveGameUp, moveGameDown } from '../renderer/src/components/categoryManager.mjs';


if (process.argv.length > 1) {
  const scriptPath = process.argv[1];
  if (path.basename(scriptPath) === 'update-json.mjs') {
    try {
      await initData();
      log.info('数据初始化完成');
    } catch (error) {
      log.error('脚本执行失败:', error);
      // 可以在这里添加代码来显示错误对话框或写入错误日志
      dialog.showErrorBox('安装错误', `更新脚本执行失败: ${error.message}`);
    }
    app.quit();
  }
}

log.initialize();

log.errorHandler.startCatching();

log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB

let mainWindow
let tray = null;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1730,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    icon: icon,
    // ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      toggleFullScreen();
      event.preventDefault();
    }
  });
}

async function initAppData() {
  if (!app.isPackaged) {
    console.log('应用未打包，跳过初始化');
    return;
  }

  try {
    const syncPath = getSyncPath('');
    const exists = await fs.access(syncPath).then(() => true).catch(() => false);

    if (!exists) {
      await fs.mkdir(syncPath, { recursive: true });
      log.info('同步目录初始化完成');
    } else {
      console.log('同步目录已存在，无需初始化');
    }
  } catch (error) {
    log.error('初始化同步目录时出错:', error);
  }
}

function toggleFullScreen() {
  if (mainWindow) {
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
  }
}

async function getFileIcon(filePath, id) {
  try {
    const icon = await app.getFileIcon(filePath, { size: 'large' });

    // 转换为 PNG 格式的 Buffer
    const pngBuffer = icon.toPNG();

    // 获取完整的文件路径
    const fullPath = getDataPath(`/games/${id}/icon.png`);

    // 确保目录存在
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // 写入文件
    await fs.writeFile(fullPath, pngBuffer);

    log.info(`成功保存图标到 ${fullPath}`);
  } catch (error) {
    log.error('获取或保存文件图标时出错:', error);
  }
}

function bringApplicationToFront() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    if (process.platform === 'darwin') {
      app.dock.show();
      app.focus({ steal: true });
    } else {
      win.setAlwaysOnTop(true);
      win.show();
      win.focus();
      win.setAlwaysOnTop(false);
    }
  }
}

async function retryAddGame(fn, retries, mainWindow) {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      log.warn(`操作失败，${1000 / 1000}秒后重试。剩余重试次数：${retries - 1}`);
      mainWindow.webContents.send('add-game-log', `[warning] 操作失败，1秒后重试。剩余重试次数：${retries - 1}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return retryAddGame(fn, retries - 1, mainWindow);
    }
    throw error;
  }
}

async function retry(fn, retries) {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      log.warn(`操作失败，${1000 / 1000}秒后重试。剩余重试次数：${retries - 1}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return retry(fn, retries - 1);
    }
    throw error;
  }
}

async function appToSync() {
  //将app文件夹下的文件同步到sync文件夹下
  try {
    const appPath = getAppPath('');
    const syncPath = getSyncPath('');
    await fse.copy(appPath, syncPath);
    log.info('本地同步完成，app -> sync');
  } catch (error) {
    log.error('本地同步出错，app -> sync:', error);
  }
}

async function syncToApp() {
  //将sync文件夹下的文件同步到app文件夹下
  try {
    const appPath = getAppPath('');
    const syncPath = getSyncPath('');
    //排除.git文件夹
    const files = await fs.readdir(syncPath);
    for (const file of files) {
      if (file === '.git') {
        continue;
      }
      const syncFilePath = join(syncPath, file);
      const appFilePath = join(appPath, file);
      await fse.copy(syncFilePath, appFilePath);
    }
    log.info('本地同步完成，sync -> app');
  } catch (error) {
    log.error('本地同步出错，sync -> app:', error);
  }
}


let processes = new Map();
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  log.transports.file.resolvePathFn = () => getLogsPath();

  electronApp.setAppUserModelId('vnite')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  await initAppData();

  createWindow()

  // 获取版本号
  const version = app.getVersion();

  log.info('App started 应用已启动');
  log.info('Version 版本:', version);

  await appToSync();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  tray = new Tray(icon);

  tray.setToolTip('vnite');

  nativeTheme.themeSource = 'dark';

  const rightMenu = Menu.buildFromTemplate([
    { label: '复制', role: 'copy', accelerator: 'CmdOrCtrl+C' },
    { label: '粘贴', role: 'paste', accelerator: 'CmdOrCtrl+V' }
  ]);

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { bringApplicationToFront() } },
    { type: 'separator' },
    {
      label: '切换至全屏/窗口',
      click: () => { toggleFullScreen(); }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => { app.quit(); }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    bringApplicationToFront()
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-unmaximized');
  });


  ipcMain.on('close', () => app.quit())

  ipcMain.on('minimize', () => {
    mainWindow.minimize();
  })

  ipcMain.on('maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on('show-right-menu', (event) => {
    rightMenu.popup({ window: mainWindow });
  });

  ipcMain.handleOnce('pull-changes', async (event) => {
    try {
      const localPath = getSyncPath('');
      await pullChanges(localPath);
      await syncToApp();
      const gameData = await getGameData(getDataPath('data.json'));
      const configData = await getConfigData();
      mainWindow.webContents.send('config-data-updated', configData);
      mainWindow.webContents.send('game-data-updated', gameData);
    } catch (error) {
      log.error('同步云端数据时出错:', error);
      throw error;
    }
  });

  ipcMain.on('add-new-category', async (event, categoryName) => {
    await addNewCategory(getDataPath('categories.json'), categoryName);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  });

  ipcMain.on('add-new-game-in-category', async (event, categoryId, gameId) => {
    await addNewGameToCategory(getDataPath('categories.json'), categoryId, gameId);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  });

  ipcMain.on('delete-category', async (event, categoryId) => {
    await deleteCategory(getDataPath('categories.json'), categoryId);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  })

  ipcMain.on('delete-game-from-category', async (event, categoryId, gameId) => {
    await deleteGameFromCategory(getDataPath('categories.json'), categoryId, gameId);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  })

  ipcMain.on('move-category-up', async (event, categoryId) => {
    await moveCategoryUp(getDataPath('categories.json'), categoryId);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  })

  ipcMain.on('move-category-down', async (event, categoryId) => {
    await moveCategoryDown(getDataPath('categories.json'), categoryId);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  })

  ipcMain.on('move-game-up', async (event, categoryId, gameId) => {
    await moveGameUp(getDataPath('categories.json'), categoryId, gameId);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  })

  ipcMain.on('move-game-down', async (event, categoryId, gameId) => {
    await moveGameDown(getDataPath('categories.json'), categoryId, gameId);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  })

  ipcMain.handle('get-app-version', async (event) => {
    return app.getVersion();
  });

  ipcMain.handle('get-game-name', async (event, id) => {
    try {
      return await searchGameNamebyId(id);
    } catch (error) {
      log.error('获取游戏名称时出错(gid错误):', error);
      throw error;
    }
  });

  ipcMain.handle('get-game-icon', async (event, filePath, id) => {
    await getFileIcon(filePath, id);
  });

  ipcMain.handle('update-game-icon', async (event, gameId, imgPath) => {
    try {
      const iconDir = getDataPath(`games/${gameId}/`);
      const iconPath = join(iconDir, 'icon.png');

      // 确保目标文件夹存在
      await fs.mkdir(iconDir, { recursive: true });

      await sharp(imgPath)
        .resize(256, 256) // 将图片调整为 256x256 像素
        .png() // 转换为 PNG 格式
        .toFile(iconPath);

      log.info(`成功保存游戏 ${gameId} 图标到 ${iconPath}`);

      return iconPath;
    } catch (error) {
      log.error(`更新游戏 ${gameId} 图标时出错:`, error);
      throw error;
    }
  });

  ipcMain.handle('open-file-dialog', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '可执行文件', extensions: ['exe'] },
        { name: '批处理文件', extensions: ['bat'] }
      ]
    });
    if (result.canceled) {
      return null;
    } else {
      return result.filePaths[0];
    }
  });

  ipcMain.handle('open-le-dialog', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '可执行文件', extensions: ['exe'] }
      ]
    });
    if (result.canceled) {
      return null;
    } else {
      return result.filePaths[0];
    }
  });

  ipcMain.handle('open-img-dialog', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }
      ]
    });
    if (result.canceled) {
      return null;
    } else {
      return result.filePaths[0];
    }
  });

  ipcMain.handle('open-file-folder-dialog', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory'],
    });
    if (result.canceled) {
      return null;
    } else {
      return result.filePaths[0];
    }
  });

  ipcMain.handle('add-new-game-to-data', async (event, gid, coverUrl, bgUrl) => {
    await retryAddGame(() => addNewGameToData(gid, coverUrl, bgUrl, getDataPath('games'), join(getAppRootPath(), 'assets')), 3, mainWindow);
    return
  });

  ipcMain.on('organize-game-data', async (event, gid, savePath, gamePath) => {
    await organizeGameData(gid, savePath, gamePath, mainWindow, getDataPath(''));
    const gameData = await getGameData(getDataPath('data.json'));
    mainWindow.webContents.send('game-data-organized', gameData);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  });

  ipcMain.on('update-game-meta-data', async (event, id, gid) => {
    await updateGameMetaData(id, gid, mainWindow, getDataPath(''));
    const gameData = await getGameData(getDataPath('data.json'));
    mainWindow.webContents.send('game-data-organized', gameData);
  });

  ipcMain.on('organize-game-data-empty', async (event, filePath) => {
    const name = path.basename(filePath, path.extname(filePath));
    const id = generateNineDigitNumber(name)
    await organizeGameDataEmpty(name, id, mainWindow, getDataPath(''), getDataPath('games'), join(getAppRootPath(), 'assets'), filePath);
    await getFileIcon(filePath, id);
    const gameData = await getGameData(getDataPath('data.json'));
    mainWindow.webContents.send('game-data-organized', gameData);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  });

  ipcMain.handle('generate-id', async (event, name) => {
    return generateNineDigitNumber(name);
  });

  ipcMain.handle('get-game-data', async (event) => {
    return await getGameData(getDataPath('data.json'));
  });



  ipcMain.on('start-game', (event, gamePath, gameId) => {
    const processId = gameId
    const startTime = Date.now();

    const exeProcess = spawn(gamePath);
    processes.set(processId, { process: exeProcess, startTime });

    exeProcess.on('error', (error) => {
      event.reply('game-start-result', { processId, success: false, error: error.message });
      processes.delete(processId);
    });

    exeProcess.on('exit', (code, signal) => {
      const endTime = Date.now();
      const runningTime = Math.floor((endTime - startTime) / 1000); // 转换为秒
      log.info(`Game ${processId} exited. Running time: ${runningTime} seconds`);
      mainWindow.webContents.send('game-running-time', { processId, runningTime });
      processes.delete(processId);
    });

    event.reply('game-start-result', { processId, success: true });
  });

  app.on('will-quit', () => {
    for (let [id, { process }] of processes) {
      process.kill();
    }
  });

  ipcMain.on('update-game-data', async (event, newData) => {
    await updateGameData(newData, getDataPath('data.json'));
    mainWindow.webContents.send('game-data-updated', newData);
  })

  ipcMain.on('save-category-data', async (event, newData) => {
    await updateCategoryData(getDataPath('categories.json'), newData);
  })

  ipcMain.handle('get-category-data', async (event) => {
    return await getCategoryData(getDataPath('categories.json'));
  });

  ipcMain.on('save-game-data', async (event, data) => {
    await updateGameData(data, getDataPath('data.json'));
  })

  ipcMain.on('open-folder', async (event, path) => {
    shell.openPath(join(app.getAppPath(), path));
    log.info(`打开文件夹: ${path}`);
  })

  ipcMain.handle('update-game-cover', async (event, gameId, imgPath) => {
    try {
      const coverDir = getDataPath(`games/${gameId}/`)
      const coverPath = join(coverDir, 'cover.webp');

      // 确保目标文件夹存在
      await fs.mkdir(coverDir, { recursive: true });

      // 处理图片：只转换为WebP格式，不改变分辨率
      await sharp(imgPath)
        .webp({ quality: 100 })
        .toFile(coverPath);

      log.info(`成功保存游戏 ${gameId} 封面到 ${coverPath}`);
      return coverPath;
    } catch (error) {
      log.error(`更新游戏 ${gameId} 封面时出错:`, error);
      throw error;
    }
  });

  ipcMain.handle('update-game-background', async (event, gameId, imgPath) => {
    try {
      const bgDir = getDataPath(`games/${gameId}/`)
      const bgPath = join(bgDir, 'background.webp');

      // 确保目标文件夹存在
      await fs.mkdir(bgDir, { recursive: true });

      // 处理图片：只转换为WebP格式，不改变分辨率
      await sharp(imgPath)
        .webp({ quality: 100 })
        .toFile(bgPath);

      log.info(`成功保存游戏 ${gameId} 背景到 ${bgPath}`);
      return bgPath;
    } catch (error) {
      log.error(`更新游戏 ${gameId} 背景时出错:`, error);
      throw error;
    }
  })

  ipcMain.handle('copy-save', async (event, savePath, gameId, saveId) => {
    const saveDir = getDataPath(`games/${gameId}/saves/${saveId}/`);
    try {
      // 首先确保目标目录存在
      await fse.ensureDir(saveDir);

      // 清空目标目录
      await fse.emptyDir(saveDir);

      // 然后复制文件
      await fse.copy(savePath, saveDir, { overwrite: true });

      log.info(`成功复制游戏 ${gameId} 存档到 ${saveDir}`);
    } catch (error) {
      log.error(`复制游戏 ${gameId} 存档时出错:`, error);
    }
  });

  ipcMain.on('delete-save', async (event, gameId, saveId) => {
    const saveDir = getDataPath(`games/${gameId}/saves/${saveId}/`);
    try {
      await fse.remove(saveDir);
      log.info(`成功删除游戏 ${gameId} 存档 ${saveId}`);
      event.reply('delete-save-reply', 'success');
    } catch (error) {
      log.error(`删除游戏 ${gameId} 存档时出错:`, error);
      event.reply('delete-save-reply', 'error', error.message);
    }
  })

  ipcMain.on('switch-save', async (event, gameId, saveId, realSavePath) => {
    const savePath = getDataPath(`games/${gameId}/saves/${saveId}/`);
    try {
      await fse.move(savePath, realSavePath, { overwrite: true });
      log.info(`成功切换游戏 ${gameId} 存档 ${saveId}`);
      event.reply('switch-save-reply', 'success');
    } catch (error) {
      log.error(`切换游戏 ${gameId} 存档时出错:`, error);
      event.reply('switch-save-reply', 'error', error.message);
    }
  })

  ipcMain.on('save-memory-img', async (event, gameId, imgId, imgPath) => {
    const imgDir = getDataPath(`games/${gameId}/memories/`); // 存储记忆图片的目录
    const webpFileName = `${imgId}.webp`; // 使用imgId作为文件名
    const webpFilePath = join(imgDir, webpFileName);

    try {
      // 确保目标文件夹存在
      await fse.ensureDir(imgDir);

      // 使用sharp读取原图片，转换为WebP格式，然后保存
      await sharp(imgPath)
        .webp({ quality: 100 })
        .toFile(webpFilePath);

      log.info(`成功保存游戏 ${gameId} 记忆图片 ${imgId} 到 ${webpFilePath}`);
    } catch (error) {
      log.error(`保存游戏 ${gameId} 记忆图片时出错:`, error);
    }
  });

  const execFileAsync = util.promisify(execFile);

  ipcMain.handle('check-git-installed', async () => {
    try {
      const { stdout } = await execFileAsync('git', ['--version']);
      log.info('Git 版本:', stdout.trim());
      return true;
    } catch (error) {
      log.error('Git 检测错误:', error.message);
      return false;
    }
  });

  ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('get-config-data', async (event) => {
    return await getConfigData();
  });

  ipcMain.handle('update-config-data', async (event, newData) => {
    await updateConfigData(newData);
  });

  ipcMain.on('save-config-data', async (event, data) => {
    await updateConfigData(data);
  })

  ipcMain.handle('start-auth-process', async (event, clientId, clientSecret) => {
    try {
      const result = await startAuthProcess(mainWindow, clientId, clientSecret);
      log.info('Github认证成功:', result);
      return result;
    } catch (error) {
      log.error('Github认证错误:', error);
      return error;
    }
  });

  ipcMain.handle('initialize-repo', async (event, token, owner) => {
    try {
      const syncPath = getSyncPath('')
      const dataPath = getDataPath('data.json');
      await appToSync();
      const data = await initializeRepo(token, owner, syncPath, mainWindow, dataPath);
      await syncToApp();
      const gameData = await getGameData(getDataPath('data.json'));
      mainWindow.webContents.send('game-data-updated', gameData);
      log.info('初始化仓库成功:', data);
      return data
    } catch (error) {
      log.error('初始化仓库时出错:', error);
      mainWindow.webContents.send('initialize-error', error.message);
      throw error;
    }
  })

  ipcMain.on('restart-app', () => {
    if (app.isPackaged) {
      app.relaunch();
      app.exit(0);
    } else {
      return;
    }
  });

  ipcMain.handle('initialize-use-local-data', async (event, token, owner) => {
    try {
      const path = getSyncPath('')
      await appToSync();
      await initAndPushLocalRepo(token, path, owner);
      const gameData = await getGameData(getDataPath('data.json'));
      mainWindow.webContents.send('game-data-updated', gameData);
      log.info('使用本地数据初始化仓库成功');
      return `https://github.com/${owner}/my-vnite.git`;
    } catch (error) {
      log.error('使用本地数据初始化仓库出错', error);
      mainWindow.webContents.send('initialize-error', error.message);
    }
  })

  ipcMain.handle('initialize-use-cloud-data', async (event, token, owner) => {
    try {
      const path = getSyncPath('')
      await fse.remove(path);
      await clonePrivateRepo(token, `https://github.com/${owner}/my-vnite.git`, path)
      await syncToApp();
      const gameData = await getGameData(getDataPath('data.json'));
      mainWindow.webContents.send('game-data-updated', gameData);
      log.info('使用云端数据初始化仓库成功');
      return `https://github.com/${owner}/my-vnite.git`;
    } catch (error) {
      log.error('使用云端数据初始化仓库出错', error);
      mainWindow.webContents.send('initialize-error', error.message);
    }
  })

  ipcMain.handle('cloud-sync-github', async (event, message) => {
    try {
      const path = getSyncPath('')
      await appToSync();
      await commitAndPush(path, message);
      log.info('Github同步成功');
      return 'success';
    } catch (error) {
      log.error('Github同步失败：', error);
      return error.message;
    }
  })

  ipcMain.handle('sign-out-github', async (event) => {
    try {
      const path = getSyncPath('.git')
      await fse.remove(path);
      log.info('退出Github成功');
      return 'success';
    } catch (error) {
      log.error('退出Github失败：', error);
      return error.message;
    }
  })

  ipcMain.handle('cloud-sync-webdav-upload', async (event, webdavUrl, webdavUser, webdavPass, remotePath) => {
    try {
      const path = getSyncPath('')
      const client = await createWebDavClient(webdavUrl, webdavUser, webdavPass);
      await uploadDirectory(client, path, remotePath);
      log.info('WebDav同步（上传）成功');
      return 'success';
    } catch (error) {
      log.error('WebDav同步（上传）失败：', error);
      return error.message;
    }
  })

  ipcMain.handle('cloud-sync-webdav-download', async (event, webdavUrl, webdavUser, webdavPass, remotePath) => {
    try {
      const path = getSyncPath('')
      await fse.emptyDir(path); // 清空本地目录
      const client = await createWebDavClient(webdavUrl, webdavUser, webdavPass);
      await downloadDirectory(client, remotePath, path);
      log.info('WebDav同步（下载）成功');
      return 'success';
    } catch (error) {
      log.error('WebDav同步（下载）失败：', error);
      return error.message;
    }
  })


  ipcMain.handle('get-folder-size', async (event, inputPath) => {
    try {
      // 获取上一级目录的路径
      const parentPath = path.dirname(inputPath);

      const size = await getFolderSize.loose(parentPath, { bigint: true });
      const sizeInMB = Number((size / BigInt(1024 * 1024))).toFixed(0);
      log.info(`文件夹 ${parentPath} 的大小为 ${sizeInMB} MB`);
      return Number(sizeInMB);
    } catch (err) {
      log.error('获取文件夹大小时出错:', err);
      throw err;
    }
  });

  ipcMain.on('open-folder-in-explorer', async (event, inputPath) => {
    try {
      if (inputPath.endsWith('.exe')) {
        shell.openPath(path.dirname(inputPath));
        log.info(`打开文件夹: ${path.dirname(inputPath)}`);
        return;
      }
      if (inputPath.startsWith('/')) {
        shell.openPath(getDataPath(inputPath));
        log.info(`打开文件夹: ${getDataPath(inputPath)}`);
        return;
      }
      shell.openPath(inputPath);
      log.info(`打开文件夹: ${inputPath}`);
    } catch (err) {
      log.error('打开文件夹时出错:', err);
      throw err;
    }
  });

  ipcMain.on('delete-game', async (event, index) => {
    await deleteGame(index, getDataPath(''));
    await deleteGameFromAllCategories(getDataPath('categories.json'), index);
    const gameData = await getGameData(getDataPath('data.json'));
    log.info(`成功删除游戏 ${index}`);
    mainWindow.webContents.send('game-data-updated', gameData);
    const categoryData = await getCategoryData(getDataPath('categories.json'));
    mainWindow.webContents.send('category-data-updated', categoryData);
  });

  ipcMain.handle('get-data-path', (event, file) => {
    return getDataPath(file);
  });

  ipcMain.handle('get-config-path', (event, file) => {
    return getConfigPath(file);
  });

  ipcMain.on('open-and-monitor', async (event, programPath, id, startWithLe, lePath) => {
    try {
      await openExternalProgram(programPath, id, event, startWithLe, lePath);
      log.info(`成功打开游戏 ${id}`);
    } catch (error) {
      log.error(`打开游戏 ${id} 时出错:`, error);
    }
  });

  ipcMain.handle('get-github-releases', async (event, owner, repo) => {
    const releases = await getGitHubReleases(owner, repo);
    return parseReleases(releases);
  });

  ipcMain.handle('compare-versions', async (event, version1, version2) => {
    return semver.compare(version1, version2);
  });

  ipcMain.on('search-game-in-adv3', (event, name) => {
    searchInADV3(name);
  });

  mainWindow.on('close', async (event) => {
    event.preventDefault();
    await handleAppExit();
  });

})

async function openGameWithLe(gamePath, lePath) {
  try {
    // 获取游戏路径的上级目录
    const gameDir = path.dirname(gamePath);

    // 构造命令
    const command = 'cmd.exe';
    const args = [
      '/c',
      'chcp 65001 >nul && ' +
      `cd /d "${gameDir}" && ` +
      `"${lePath}" "${gamePath}"`
    ];

    // 使用spawn执行命令，这里将变量名从 process 改为 childProcess
    const childProcess = spawn(command, args, {
      shell: true,
      windowsHide: true,
      env: { ...process.env, LANG: 'zh_CN.UTF-8' }
    });

    childProcess.stdout.on('data', (data) => {
      console.log(`输出: ${data.toString('utf8')}`);
    });

    childProcess.stderr.on('data', (data) => {
      console.error(`错误: ${data.toString('utf8')}`);
    });

    childProcess.on('close', (code) => {
      console.log(`子进程退出，退出码 ${code}`);
    });

    childProcess.on('error', (error) => {
      console.error(`执行错误: ${error.message}`);
    });

  } catch (error) {
    console.error(`执行错误: ${error.message}`);
  }
}

import crypto from 'crypto';

function generateNineDigitNumber(inputString) {
  // 计算输入字符串的MD5哈希值
  const hash = crypto.createHash('md5').update(inputString).digest('hex');

  // 将哈希值转换为数字（取前8位十六进制，转为十进制）
  const number = parseInt(hash.slice(0, 8), 16);

  // 对900000000取模，然后加上100000000，确保结果为9位数且不以0开头
  const nineDigitNumber = (number % 900000000) + 100000000;

  return nineDigitNumber.toString();
}

async function getGitHubReleases(owner, repo) {
  try {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'YourAppName/1.0'
      },
      params: {
        per_page: 100  // 获取最多100个releases
      }
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 403) {
      log.error('访问被拒绝。可能达到了 GitHub API 的速率限制。');
    } else {
      log.error('获取 GitHub releases 时出错:', error.message);
    }
    return [];
  }
}

import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
  pedantic: false,
  sanitize: false,
  smartLists: true
});

function parseReleases(releases) {
  return releases.map(release => ({
    version: release.tag_name,
    publishedAt: release.published_at,
    description: marked(release.body),
    assets: release.assets.map(asset => ({
      name: asset.name,
      downloadUrl: asset.browser_download_url,
      size: asset.size
    }))
  }));
}


function getAppRootPath() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  } else {
    return app.getAppPath();
  }
}

export function getDataPath(file) {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), '/app/data', file);
  } else {
    return path.join(getAppRootPath(), '/src/renderer/public/app/data', file);
  }
}

export function getConfigPath(file) {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), '/app/config', file);
  } else {
    return path.join(getAppRootPath(), '/src/renderer/public/app/config', file);
  }
}

export function getSyncPath(file) {
  if (app.isPackaged) {
    return path.join(getAppRootPath(), '/sync', file);
  } else {
    return path.join(getAppRootPath(), '/src/renderer/public/sync', file);
  }
}

export function getAppPath(file) {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), '/app', file);
  } else {
    return path.join(getAppRootPath(), '/src/renderer/public/app', file);
  }
}

function getLogsPath() {
  if (app.isPackaged) {
    return path.join(getAppRootPath(), '/logs/app.log');
  } else {
    return path.join(getAppRootPath(), '/logs/app.log');
  }
}

async function handleAppExit() {
  try {
    await appToSync();
    await waitExitInRenderer();
    log.info('应用已退出');
    app.exit(0); // 正常退出
  } catch (error) {
    log.error('退出过程中出错:', error);
    app.exit(1); // 异常退出
  }
}

function waitExitInRenderer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('等待渲染进程响应超时'));
    }, 50000); // 设置50秒超时

    mainWindow.webContents.send('app-exiting');

    ipcMain.once('app-exit-processed', (event, result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}


// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

let startTime = null;
let endTime = null;
let runningPrograms = new Set();
let monitoringInterval;

async function openExternalProgram(programPath, id, event, startWithLe, lePath) {
  try {
    const programDir = path.dirname(programPath);
    const programName = path.basename(programPath);

    if (startWithLe) {
      if (!lePath) {
        throw new Error('未提供LE路径');
      }
      await openGameWithLe(programPath, lePath);
    } else {
      const child = spawn(programName, [], {
        cwd: programDir,
        detached: true,
        stdio: 'ignore'
      });

      child.on('error', (error) => {
        log.error(`启动游戏 ${id} 时出错:`, error);
        event.reply('game-start-result', { id: id, success: false, error: error.message });
        return
      });

      child.unref();
    }

    event.reply('game-start-result', { id: id, success: true });

    const parentDir = path.dirname(programPath);
    await scanDirectory(parentDir);
    startMonitoring(id, event);
  } catch (error) {
    log.error(`启动游戏 ${id} 时出错:`, error);
    event.reply('game-start-result', { id: id, success: false, error: error.message });
  }
}

async function scanDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      if (await isExecutable(filePath)) {
        runningPrograms.add(path.basename(file).toLowerCase());
      }
    }
  } catch (error) {
    log.error(`扫描目录 ${dirPath} 时出错:`, error);
  }
}

async function isExecutable(filePath) {
  const stats = await fs.stat(filePath);

  if (!stats.isFile()) {
    return false;
  }

  switch (process.platform) {
    case 'win32':
      const ext = path.extname(filePath).toLowerCase();
      return ['.exe', '.bat', '.cmd', '.com'].includes(ext);

    case 'darwin':
    case 'linux':
      return (stats.mode & fs.constants.S_IXUSR) !== 0 ||
        (stats.mode & fs.constants.S_IXGRP) !== 0 ||
        (stats.mode & fs.constants.S_IXOTH) !== 0;

    default:
      log.warn(`未知操作系统，无法确定文件 ${filePath} 是否可执行`);
      return false;
  }
}

function startMonitoring(id, event) {
  startTime = Date.now();
  monitoringInterval = setInterval(() => checkRunningPrograms(id, event), 1000);
}

import psList from 'ps-list';

async function checkRunningPrograms(id, event) {
  try {
    const processes = await psList();
    const runningProcesses = new Set(processes.map(p => p.name.toLowerCase()));

    let allStopped = true;
    for (const program of runningPrograms) {
      if (runningProcesses.has(program)) {
        allStopped = false;
        break;
      }
    }

    if (allStopped) {
      endTime = Date.now();
      clearInterval(monitoringInterval);
      reportTotalRunTime(id, event);
    } else {
      // 可以添加更多的信息日志
      const runningTargetProcesses = processes.filter(p => runningPrograms.has(p.name.toLowerCase()));
      console.log(`仍在运行的目标进程: ${JSON.stringify(runningTargetProcesses)}`);
    }
  } catch (error) {
    log.error(`执行 ${id} 错误: ${error}`);
  }
}

function reportTotalRunTime(id, event) {
  const totalRunTime = Math.floor((endTime - startTime) / 1000) // 转换为秒
  id = `${id}`;
  event.reply('monitoring-result', { id, totalRunTime });
  startTime = null;
  endTime = null;
  runningPrograms.clear();
}

function searchInADV3(name) {
  // 对搜索词进行 URL 编码，确保特殊字符被正确处理
  const encodedName = encodeURIComponent(name);

  // 构造搜索 URL
  const searchUrl = `https://adv.acg3.org/search/?q=${encodedName}`;

  // 使用默认浏览器打开搜索 URL
  shell.openExternal(searchUrl)
    .then(() => {
      console.log(`搜索 "${name}" 的页面已在浏览器中打开`);
    })
    .catch(err => {
      console.error('打开浏览器时发生错误:', err);
    });
}


