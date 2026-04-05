import { cn } from '@/lib/utils'

interface Props {
  value: number // 0-100
  outdatedValue?: number | null,
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function ProgressBar({ value, className, showLabel = false, size = 'sm' }: Props) {
  const color =
    value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex-1 overflow-hidden rounded-full bg-muted', // Добавили relative
          size === 'sm' ? 'h-1.5' : 'h-2.5'
        )}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 text-right text-xs text-muted-foreground">{value}%</span>
      )}
    </div>
  )
}
