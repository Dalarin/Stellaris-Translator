import { Copy, CheckCheck, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TranslationEntry, EntryStatus } from '@/types'

const STATUS_BUTTON: Record<EntryStatus, { label: string; activeClass: string; title: string }> = {
  missing:    { label: 'Missing',     activeClass: 'bg-red-500/20 text-red-400 border-red-500/30',       title: '' },
  outdated:   { label: 'Outdated',    activeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', title: '' },
  translated: { label: 'Done',        activeClass: 'bg-green-500/20 text-green-400 border-green-500/30',  title: 'Mark as not translated' },
  approved:   { label: '★ Approved',  activeClass: 'bg-blue-400/20 text-blue-400 border-blue-400/30',    title: 'Revoke approval' },
}

export interface EntryActionsProps {
  entry: TranslationEntry
  onCopyOriginal: () => void
  onMarkDone: () => void
  onMarkApproved: () => void
  onToggleUntranslated: () => void
}

export function EntryActions({ entry, onCopyOriginal, onMarkDone, onMarkApproved, onToggleUntranslated }: EntryActionsProps) {
  const isDone     = entry.status === 'translated'
  const isApproved = entry.status === 'approved'

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onCopyOriginal}
        className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
        title="Скопировать оригинальный текст в поле перевода"
      >
        <Copy size={11} /> Copy EN
      </button>

      {(isDone || isApproved) && (
        <button
          onClick={onToggleUntranslated}
          className={cn('flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors', STATUS_BUTTON[entry.status].activeClass)}
          title={STATUS_BUTTON[entry.status].title}
        >
          {STATUS_BUTTON[entry.status].label}
        </button>
      )}

      {!isApproved && (
        <button
          onClick={onMarkDone}
          className={cn(
            'flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors',
            isDone ? STATUS_BUTTON.translated.activeClass : 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30',
          )}
          title="Отметить как готово и перейти к следующему (Ctrl+Enter)"
        >
          <CheckCheck size={11} />
          {isDone ? 'Done' : 'Mark Done'}
        </button>
      )}

      <button
        onClick={onMarkApproved}
        className={cn(
          'flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors',
          isApproved ? STATUS_BUTTON.approved.activeClass : 'border-border text-muted-foreground hover:border-blue-400/50 hover:text-blue-400',
        )}
        title="Одобрить перевод и перейти к следующему (Ctrl+Shift+Enter)"
      >
        <Star size={11} />
        {isApproved ? 'Approved' : 'Approve'}
      </button>
    </div>
  )
}
