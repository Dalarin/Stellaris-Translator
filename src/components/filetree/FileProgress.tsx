import type { FileStats } from '@/types'
import { cn } from '@/lib/utils'
import { calcProgress } from '@/utils/progressCalc'

interface Props {
  stats: FileStats
}

export function FileProgress({ stats }: Props) {
  const pct = calcProgress(stats)
  const color = stats.approved >= stats.total ? 'bg-blue-500' : pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'


  return (
    <div className="flex items-center gap-1.5" title={`${pct}% translated`}>
      <div className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-7 text-right">{pct}%</span>
    </div>
  )
}
