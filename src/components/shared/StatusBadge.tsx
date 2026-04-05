import { cn } from '@/lib/utils'
import type { EntryStatus } from '@/types'

interface Props {
  status: EntryStatus
  className?: string
}

const CONFIG: Record<EntryStatus, { label: string; className: string }> = {
  approved:   { label: '★ Approved', className: 'border-blue-400/40 bg-blue-400/10 text-blue-400' },
  translated: { label: '✓ Done',     className: 'status-translated' },
  outdated:   { label: '⚠ Outdated', className: 'status-outdated' },
  missing:    { label: '✗ Missing',  className: 'status-missing' },
}

export function StatusBadge({ status, className }: Props) {
  const { label, className: statusClass } = CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
        statusClass,
        className
      )}
    >
      {label}
    </span>
  )
}
