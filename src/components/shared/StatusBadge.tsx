import { cn } from '@/lib/utils'
import type { TranslationEntry } from '@/types'

interface Props {
  status: TranslationEntry['status']
  className?: string
}

const labels = {
  translated: '✓ Done',
  outdated: '⚠ Outdated',
  missing: '✗ Missing',
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
        status === 'translated' && 'status-translated',
        status === 'outdated' && 'status-outdated',
        status === 'missing' && 'status-missing',
        className
      )}
    >
      {labels[status]}
    </span>
  )
}
