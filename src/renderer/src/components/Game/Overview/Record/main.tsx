import { cn } from '~/utils'
import { RecordCard } from './RecordCard'
import { useDBSyncedState } from '~/hooks'
import {
  formatTimeToChinese,
  formatDateToISO,
  formatPlayStatusToChinese,
  formatScoreToChinese
} from '~/utils'

export function Record({ gameId }: { gameId: string }): JSX.Element {
  const [lastRunDate] = useDBSyncedState('', `games/${gameId}/record.json`, ['lastRunDate'])
  const [playStatus] = useDBSyncedState('unplayed', `games/${gameId}/record.json`, ['playStatus'])
  const [score] = useDBSyncedState(-1, `games/${gameId}/record.json`, ['score'])
  const [playingTime] = useDBSyncedState(0, `games/${gameId}/record.json`, ['playingTime'])
  return (
    <div className={cn('flex flex-row gap-5', '3xl:gap-7')}>
      <RecordCard
        title="游玩时间"
        content={playingTime !== 0 ? formatTimeToChinese(playingTime) : '暂无'}
        icon="icon-[mdi--timer-outline] w-[20px] h-[20px]"
        className={cn('w-1/4')}
      />
      <RecordCard
        title="最后运行日期"
        content={lastRunDate ? formatDateToISO(lastRunDate) : '从未运行'}
        icon="icon-[mdi--calendar-blank-multiple] w-[18px] h-[18px]"
        className={cn('w-1/4')}
      />
      <RecordCard
        title="状态"
        content={formatPlayStatusToChinese(playStatus)}
        icon="icon-[mdi--bookmark-outline] w-[20px] h-[20px]"
        className={cn('w-1/4')}
      />
      <RecordCard
        title="我的评分"
        content={formatScoreToChinese(score)}
        icon="icon-[mdi--starburst-outline] w-[18px] h-[18px]"
        className={cn('w-1/4')}
      />
    </div>
  )
}
