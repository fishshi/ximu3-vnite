import { Dialog, DialogContent, DialogTrigger } from '@ui/dialog'
import { Input } from '@ui/input'
import { Button } from '@ui/button'
import { cn } from '~/utils'
import { useDBSyncedState } from '~/hooks'

export function RelatedSitesDialog({ gameId }: { gameId: string }): JSX.Element {
  const [relatedSites, setRelatedSites] = useDBSyncedState(
    [{ name: '', url: '' }],
    `games/${gameId}/metadata.json`,
    ['relatedSites']
  )
  return (
    <Dialog>
      <DialogTrigger>
        <span
          className={cn('invisible group-hover:visible w-5 h-5 icon-[mdi--square-edit-outline]')}
        ></span>
      </DialogTrigger>
      <DialogContent className={cn('w-1/2 h-1/2 max-w-none flex flex-col gap-3')}>
        <Button
          variant="outline"
          onClick={() => {
            setRelatedSites([...relatedSites, { name: '链接名', url: '地址' }])
          }}
          className={cn('w-[fit-content] ml-3')}
        >
          添加链接
        </Button>
        <div className={cn('flex flex-col gap-3 grow p-3 overflow-auto scrollbar-base')}>
          {relatedSites.map((site, i) => (
            <div key={i} className={cn('flex flex-row gap-3')}>
              <Input
                value={site.name}
                className={cn('w-1/4')}
                onChange={(e) => {
                  const newRelatedSites = [...relatedSites]
                  newRelatedSites[i].name = e.target.value
                  setRelatedSites(newRelatedSites)
                }}
                placeholder="网站名称"
              />
              <Input
                value={site.url}
                onChange={(e) => {
                  const newRelatedSites = [...relatedSites]
                  newRelatedSites[i].url = e.target.value
                  setRelatedSites(newRelatedSites)
                }}
                placeholder="网站链接"
              />
              <div className={cn('flex flex-row gap-2 grow')}>
                <Button
                  variant="outline"
                  size={'icon'}
                  onClick={() => {
                    if (i === 0) return
                    const newRelatedSites = [...relatedSites]
                    const temp = newRelatedSites[i]
                    newRelatedSites[i] = newRelatedSites[i - 1]
                    newRelatedSites[i - 1] = temp
                    setRelatedSites(newRelatedSites)
                  }}
                >
                  <span className={cn('icon-[mdi--keyboard-arrow-up] w-4 h-4')}></span>
                </Button>
                <Button
                  variant="outline"
                  size={'icon'}
                  onClick={() => {
                    if (i === relatedSites.length - 1) return
                    const newRelatedSites = [...relatedSites]
                    const temp = newRelatedSites[i]
                    newRelatedSites[i] = newRelatedSites[i + 1]
                    newRelatedSites[i + 1] = temp
                    setRelatedSites(newRelatedSites)
                  }}
                >
                  <span className={cn('icon-[mdi--keyboard-arrow-down] w-4 h-4')}></span>
                </Button>
                <Button
                  variant="outline"
                  size={'icon'}
                  className={cn('hover:bg-destructive hover:text-destructive-foreground')}
                  onClick={() => {
                    const newRelatedSites = [...relatedSites]
                    newRelatedSites.splice(i, 1)
                    setRelatedSites(newRelatedSites)
                  }}
                >
                  <span className={cn('icon-[mdi--delete-outline] w-4 h-4')}></span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}