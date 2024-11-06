import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuGroup
} from '@ui/context-menu'
import { useDBSyncedState } from '~/hooks'
import { ipcInvoke } from '~/utils'
import { NameEditorDialog } from '~/components/Game/Config/ManageMenu/NameEditorDialog'
import { DeleteGameAlert } from '~/components/Game/Config/ManageMenu/DeleteGameAlert'
import { useState } from 'react'
import { toast } from 'sonner'

export function ManageMenu({ gameId }: { gameId: string }): JSX.Element {
  const [gamePath] = useDBSyncedState('', `games/${gameId}/path.json`, ['gamePath'])
  const [isNameEditorDialogOpen, setIsNameEditorDialogOpen] = useState(false)

  return (
    <ContextMenuGroup>
      <ContextMenuSub>
        <ContextMenuSubTrigger>管理</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <NameEditorDialog
            gameId={gameId}
            isOpen={isNameEditorDialogOpen}
            setIsOpen={setIsNameEditorDialogOpen}
          >
            <ContextMenuItem
              onSelect={(e) => {
                e.preventDefault()
                setIsNameEditorDialogOpen(true)
              }}
            >
              重命名
            </ContextMenuItem>
          </NameEditorDialog>

          <ContextMenuSeparator />

          <ContextMenuItem
            onClick={() => {
              if (gamePath) {
                ipcInvoke('open-path-in-explorer', gamePath)
              } else {
                toast.warning('游戏路径未设置')
              }
            }}
          >
            浏览本地文件
          </ContextMenuItem>

          <ContextMenuItem
            onClick={() => {
              ipcInvoke('open-game-db-path-in-explorer', gameId)
            }}
          >
            浏览数据库
          </ContextMenuItem>

          <ContextMenuSeparator />

          <DeleteGameAlert gameId={gameId}>
            <ContextMenuItem onSelect={(e) => e.preventDefault()}>删除</ContextMenuItem>
          </DeleteGameAlert>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuGroup>
  )
}
