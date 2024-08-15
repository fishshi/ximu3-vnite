import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { addNewGameToData, getGameData, updateGameData, deleteGame } from '../renderer/public/app/data/dataManager.mjs'
import { organizeGameData } from "../renderer/src/components/scraper.mjs"
import { spawn, exec } from 'child_process';
import sharp from 'sharp';
import fs from 'fs/promises';
import fse from 'fs-extra';
import { getConfigData, updateConfigData } from '../renderer/public/app/config/configManager.mjs';
import { startAuthProcess, initializeRepo, commitAndPush, createWebDavClient, uploadDirectory, downloadDirectory, initAndPushLocalRepo, clonePrivateRepo } from '../renderer/src/components/cloudSync.mjs';
import getFolderSize from "get-folder-size";
import path from 'path';
import chokidar from 'chokidar';

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
    ...(process.platform === 'linux' ? { icon } : {}),
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

  // const dataPath = getDataPath('data.json');
  // const configPath = getConfigPath('config.json');
  // const dataWatcher = chokidar.watch(dataPath);
  // const configWatcher = chokidar.watch(configPath);
  // dataWatcher.on('change', async () => {
  //   const gameData = await getGameData(dataPath);
  //   mainWindow.webContents.send('game-data-updated', gameData);
  // });
  // configWatcher.on('change', async () => {
  //   const configData = await getConfigData();
  //   mainWindow.webContents.send('config-data-updated', configData);
  // });
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

    console.log(`成功保存图标到 ${fullPath}`);
  } catch (error) {
    console.error('获取或保存文件图标时出错:', error);
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


let processes = new Map();
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // globalShortcut.register('F11', () => {
  //   toggleFullScreen();
  // });

  tray = new Tray(icon);

  tray.setToolTip('我的 Electron 应用');

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
    // 处理左键点击
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

  ipcMain.handle('get-game-icon', async (event, filePath, id) => {
    await getFileIcon(filePath, id);
  });

  ipcMain.handle('update-game-icon', async (event, gameId, imgPath) => {
    try {
      const iconDir = getDataPath(`games/${gameId}/`);
      const iconPath = join(iconDir, 'icon.png');

      // 确保目标文件夹存在
      await fs.mkdir(iconDir, { recursive: true });

      // 处理图片：只转换为PNG格式，不改变分辨率
      await sharp(imgPath)
        .resize(256, 256) // 将图片调整为 256x256 像素
        .png() // 转换为 PNG 格式
        .toFile(iconPath);

      return iconPath;
    } catch (error) {
      console.error('更新游戏图标时出错:', error);
      throw error; // 将错误传回渲染进程
    }
  });

  ipcMain.handle('open-file-dialog', async (event) => {
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

  ipcMain.on('add-new-game-to-data', async (event, gid, coverUrl, bgUrl) => {
    await addNewGameToData(gid, coverUrl, bgUrl, getDataPath('games'));
  });

  ipcMain.on('organize-game-data', async (event, gid, savePath, gamePath) => {
    await organizeGameData(gid, savePath, gamePath, mainWindow, getDataPath(''));
    const gameData = await getGameData(getDataPath('data.json'));
    mainWindow.webContents.send('game-data-organized', gameData);
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
      console.log(`Game ${processId} exited. Running time: ${runningTime} seconds`);
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

  ipcMain.on('save-game-data', async (event, data) => {
    await updateGameData(data, getDataPath('data.json'));
  })

  ipcMain.on('open-folder', async (event, path) => {
    shell.openPath(join(app.getAppPath(), path));
    console.log(join(app.getAppPath(), path));
  })

  ipcMain.handle('update-game-cover', async (event, gameId, imgPath) => {
    try {
      const coverDir = getDataPath(`games/${gameId}/`)
      const coverPath = join(coverDir, 'cover.webp');

      // 确保目标文件夹存在
      await fs.mkdir(coverDir, { recursive: true });

      // 处理图片：只转换为WebP格式，不改变分辨率
      await sharp(imgPath)
        .webp({ quality: 100 })  // 可以根据需要调整质量
        .toFile(coverPath);

      return coverPath;
    } catch (error) {
      console.error('更新游戏封面时出错:', error);
      throw error; // 将错误传回渲染进程
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
        .webp({ quality: 100 })  // 可以根据需要调整质量
        .toFile(bgPath);

      return bgPath;
    } catch (error) {
      console.error('更新游戏背景时出错:', error);
      throw error; // 将错误传回渲染进程
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

    } catch (error) {
      console.error('复制存档时出错:', error);
    }
  });

  ipcMain.on('delete-save', async (event, gameId, saveId) => {
    const saveDir = getDataPath(`games/${gameId}/saves/${saveId}/`);
    try {
      await fse.remove(saveDir);
      event.reply('delete-save-reply', 'success');
    } catch (error) {
      console.error('删除存档时出错:', error);
      event.reply('delete-save-reply', 'error', error.message);
    }
  })

  ipcMain.on('switch-save', async (event, gameId, saveId, realSavePath) => {
    const savePath = getDataPath(`games/${gameId}/saves/${saveId}/`);
    try {
      await fse.move(savePath, realSavePath, { overwrite: true });
      event.reply('switch-save-reply', 'success');
    } catch (error) {
      console.error('切换存档时出错:', error);
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
        .webp({ quality: 100 }) // 设置WebP质量，范围0-100
        .toFile(webpFilePath);

      console.log(`图片已保存为WebP格式：${webpFilePath}`);
    } catch (error) {
      console.error('保存记忆图片时出错:', error);
    }
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
      return result;
    } catch (error) {
      console.error('Authentication process failed:', error);
      throw error; // 这将把错误传回渲染进程
    }
  });

  ipcMain.handle('initialize-repo', async (event, token, owner) => {
    try {
      const path = getSyncPath('')
      const data = await initializeRepo(token, owner, path, mainWindow);
      const gameData = await getGameData(getDataPath('data.json'));
      mainWindow.webContents.send('game-data-updated', gameData);
      return data
    } catch (error) {
      console.error('Error initializing repository:', error);
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
      await initAndPushLocalRepo(token, path, owner);
      const gameData = await getGameData(getDataPath('data.json'));
      mainWindow.webContents.send('game-data-updated', gameData);
      return
    } catch (error) {
      console.error('Error initializing repository:', error);
      mainWindow.webContents.send('initialize-error', error.message);
    }
  })

  ipcMain.handle('initialize-use-cloud-data', async (event, token, owner) => {
    try {
      const path = getSyncPath('')
      await fse.remove(path);
      await clonePrivateRepo(token, `https://github.com/${owner}/my-gal.git`, path);
      const gameData = await getGameData(getDataPath('data.json'));
      mainWindow.webContents.send('game-data-updated', gameData);
      return
    } catch (error) {
      console.error('Error initializing repository:', error);
      mainWindow.webContents.send('initialize-error', error.message);
    }
  })

  ipcMain.handle('cloud-sync-github', async (event, message) => {
    try {
      const path = getSyncPath('')
      await commitAndPush(path, message);
      return 'success';
    } catch (error) {
      console.error('Error committing and pushing changes:', error);
      return error.message;
    }
  })

  ipcMain.handle('sign-out-github', async (event) => {
    try {
      const path = getSyncPath('.git')
      await fse.remove(path);
      return 'success';
    } catch (error) {
      console.error('Error signing out of GitHub:', error);
      return error.message;
    }
  })

  ipcMain.handle('cloud-sync-webdav-upload', async (event, webdavUrl, webdavUser, webdavPass, remotePath) => {
    try {
      const path = getSyncPath('')
      const client = await createWebDavClient(webdavUrl, webdavUser, webdavPass);
      await uploadDirectory(client, path, remotePath);
      return 'success';
    } catch (error) {
      console.error('Error uploading to WebDAV:', error);
      return error.message;
    }
  })

  ipcMain.handle('cloud-sync-webdav-download', async (event, webdavUrl, webdavUser, webdavPass, remotePath) => {
    try {
      const path = getSyncPath('')
      await fse.emptyDir(path); // 清空本地目录
      const client = await createWebDavClient(webdavUrl, webdavUser, webdavPass);
      await downloadDirectory(client, remotePath, path);
      return 'success';
    } catch (error) {
      console.error('Error downloading from WebDAV:', error);
      return error.message;
    }
  })


  ipcMain.handle('get-folder-size', async (event, inputPath) => {
    try {
      // 获取上一级目录的路径
      const parentPath = path.dirname(inputPath);

      const size = await getFolderSize(parentPath);
      const sizeInMB = Math.round(Number(size.size) / (1024 * 1024));
      return sizeInMB;
    } catch (err) {
      console.error('计算文件夹大小时出错:', err);
      throw err;
    }
  });

  ipcMain.on('open-folder-in-explorer', async (event, inputPath) => {
    try {
      if (inputPath.endsWith('.exe')) {
        shell.openPath(path.dirname(inputPath));
        return;
      }
      if (inputPath.startsWith('/')) {
        shell.openPath(join(app.getAppPath(), `src/renderer/public${inputPath}`));
        return;
      }
      shell.openPath(inputPath);
    } catch (err) {
      console.error('打开文件夹时出错:', err);
      throw err;
    }
  });

  ipcMain.on('delete-game', async (event, index) => {
    await deleteGame(index, getDataPath(''));
    const gameData = await getGameData(getDataPath('data.json'));
    mainWindow.webContents.send('game-data-updated', gameData);
  });

  ipcMain.handle('get-data-path', (event, file) => {
    return getDataPath(file);
  });

  ipcMain.handle('get-config-path', (event, file) => {
    return getConfigPath(file);
  });

  ipcMain.on('open-and-monitor', async (event, programPath, id) => {
    try {
      await openExternalProgram(programPath, id);
    } catch (error) {
      console.error('Error opening external program:', error);
    }
  });

  mainWindow.on('close', async (event) => {
    event.preventDefault(); // 阻止默认的关闭行为
    // 执行自定义的关闭逻辑
    await handleAppExit();
  });

})


function getAppRootPath() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  } else {
    return app.getAppPath();
  }
}

export function getDataPath(file) {
  if (app.isPackaged) {
    mainWindow.webContents.send('path-log', `${path.join(getAppRootPath(), '/app/data', file)}`);
    return path.join(getAppRootPath(), '/app/data', file);
  } else {
    return path.join(app.getAppPath(), '/src/renderer/public/app/data', file);
  }
}

export function getConfigPath(file) {
  if (app.isPackaged) {
    return path.join(getAppRootPath(), '/app/config', file);
  } else {
    return path.join(app.getAppPath(), '/src/renderer/public/app/config', file);
  }
}

export function getSyncPath(file) {
  if (app.isPackaged) {
    return path.join(getAppRootPath(), '/app', file);
  } else {
    return path.join(app.getAppPath(), '/src/renderer/public/app', file);
  }
}

async function handleAppExit() {
  try {
    await waitExitInRenderer();
    app.exit(0); // 正常退出
  } catch (error) {
    console.error('退出过程中出错:', error);
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

async function openExternalProgram(programPath, id) {
  try {
    const programDir = path.dirname(programPath);
    const programName = path.basename(programPath);

    const child = spawn(programName, [], {
      cwd: programDir,
      detached: true,
      stdio: 'ignore'
    });

    child.on('error', (error) => {
      console.error('启动程序时出错:', error);
      mainWindow.webContents.send('game-start-result', { id: id, success: false, error: error.message });
    });

    child.unref();

    // 假设程序成功启动
    mainWindow.webContents.send('game-start-result', { id: id, success: true });

    const parentDir = path.dirname(programPath);
    await scanDirectory(parentDir);
    startMonitoring(id);
  } catch (error) {
    console.error('打开外部程序时出错:', error);
    mainWindow.webContents.send('game-start-result', { id: id, success: false, error: error.message });
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
    console.error('扫描目录时出错:', error);
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
      console.warn('未知操作系统，无法确定文件是否可执行');
      return false;
  }
}

function startMonitoring(id) {
  startTime = Date.now();
  monitoringInterval = setInterval(() => checkRunningPrograms(id), 1000);
}

function checkRunningPrograms(id) {
  exec('tasklist /fo csv /nh', (error, stdout) => {
    if (error) {
      console.error(`执行错误: ${error}`);
      // 可能需要在这里添加一些错误处理逻辑
      return;
    }
    const runningProcesses = stdout.toLowerCase().split('\n');
    let allStopped = true;

    for (let program of runningPrograms) {
      if (runningProcesses.some(process => process.startsWith(`"${program.toLowerCase()}"`))) {
        allStopped = false;
        break;
      }
    }

    if (allStopped) {
      endTime = Date.now();
      clearInterval(monitoringInterval);
      reportTotalRunTime(id);
    }
  });
}

function reportTotalRunTime(id) {
  const totalRunTime = Math.floor((endTime - startTime) / 1000) // 转换为秒
  mainWindow.webContents.send('monitoring-result', { id, totalRunTime });
}


