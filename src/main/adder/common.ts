import { setDBValue } from '~/database'
import { getGameMetadata, getGameCover, getGameIcon, getGameScreenshots } from '~/scraper'
import { setMedia } from '~/media'
import { generateUUID, selectPathDialog, getFirstLevelSubfolders } from '~/utils'
import { BrowserWindow } from 'electron'

export async function addGameToDB(
  dataSource: string,
  id: string,
  dbId: string,
  screenshotUrl?: string
): Promise<void> {
  const metadata = await getGameMetadata(dataSource, id)
  const coverUrl = await getGameCover(dataSource, id)
  const iconUrl = await getGameIcon(dataSource, id)
  if (dbId === '') {
    dbId = generateUUID()
  }

  if (coverUrl) {
    await setMedia(dbId, 'cover', coverUrl)
  }

  if (screenshotUrl) {
    await setMedia(dbId, 'background', screenshotUrl)
  } else {
    const screenshots = await getGameScreenshots(dataSource, id)
    if (screenshots.length > 0) {
      await setMedia(dbId, 'background', screenshots[0])
    }
  }

  if (iconUrl) {
    await setMedia(dbId, 'icon', iconUrl)
  }

  await setDBValue(`games/${dbId}/metadata.json`, ['#all'], {
    id: dbId,
    ...metadata
  })

  await setDBValue(`games/${dbId}/record.json`, ['addDate'], new Date().toISOString())

  const windows = BrowserWindow.getAllWindows()
  windows.forEach((window) => {
    window.webContents.send('reload-db-values', `games/${dbId}/cover.webp`)
    window.webContents.send('reload-db-values', `games/${dbId}/background.webp`)
    window.webContents.send('reload-db-values', `games/${dbId}/icon.png`)
  })
}

export async function getBatchGameAdderData(): Promise<
  { name: string; id: string; status: string }[]
> {
  const dirPath = await selectPathDialog(['openDirectory'])
  if (!dirPath) {
    return []
  }
  const gameNames = await getFirstLevelSubfolders(dirPath)
  const data = gameNames.map((gameName) => {
    return {
      name: gameName,
      id: '',
      status: '未添加'
    }
  })
  return data
}
