import { cn } from '~/utils'
import { ScrollArea } from '@ui/scroll-area'
import { Separator } from '@ui/separator'
import { useCollections } from '~/hooks'
import { CollectionPoster } from './posters/CollectionPoster'

export function CollectionPage(): JSX.Element {
  const { collections } = useCollections()
  return (
    <div className={cn('flex flex-col gap-3 h-[100vh] pt-[30px]')}>
      <ScrollArea className={cn('w-full')}>
        <div className={cn('w-full flex flex-col gap-1 pt-3')}>
          <div className={cn('flex flex-row items-center gap-5 justify-center pl-5')}>
            <div className={cn('text-accent-foreground flex-shrink-0')}>我的收藏</div>

            {/* Split Line Container */}
            <div className={cn('flex items-center justify-center flex-grow pr-5')}>
              <Separator className={cn('flex-grow')} />
            </div>
          </div>

          {/* Game List Container */}
          <div
            className={cn(
              'flex flex-row gap-6 grow flex-wrap',
              'w-full',
              'pt-2 pb-6 pl-5' // Add inner margins to show shadows
            )}
          >
            {/* The wrapper ensures that each Poster maintains a fixed width */}
            {Object.keys(collections).map((collectionId) => (
              <div
                key={collectionId}
                className={cn(
                  'flex-shrink-0' // Preventing compression
                )}
              >
                <CollectionPoster collectionId={collectionId} />
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
