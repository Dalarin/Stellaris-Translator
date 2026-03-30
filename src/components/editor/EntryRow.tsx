import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { TranslationEntry } from '@/types'
import { stripColorCodes } from '@/parser/colorCodes'

interface Props {
  entry: TranslationEntry
  isActive: boolean
  onClick: () => void
}

const STATUS_INDICATOR = {
  translated: 'bg-green-500',
  outdated: 'bg-yellow-500',
  missing: 'bg-red-500',
}

export const EntryRow = memo(function EntryRow({ entry, isActive, onClick }: Props) {
  const preview = stripColorCodes(entry.originalText).slice(0, 60)

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/10',
        isActive && 'bg-accent/20 border-l-2 border-primary'
      )}
    >
      <div
        className={cn(
          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
          STATUS_INDICATOR[entry.status]
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-mono text-muted-foreground">{entry.key}</div>
        <div className="truncate text-xs text-foreground/80">{preview || '—'}</div>
      </div>
    </button>
  )
})
