import { useMemo, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useEditor } from '@/store/EditorContext'
import { QA_KIND_LABEL, type QaIssue, type QaKind } from '@/utils/qaChecks'
import { cn } from '@/lib/utils'

interface Props {
  issues: QaIssue[]
  onClose: () => void
}

export function QaPanel({ issues, onClose }: Props) {
  const { state, dispatch } = useEditor()
  const [kind, setKind] = useState<QaKind | 'all'>('all')

  const counts = useMemo(() => {
    const c: Record<QaKind, number> = { tokens: 0, english: 0, length: 0, glossary: 0 }
    for (const i of issues) c[i.kind]++
    return c
  }, [issues])

  const visible = kind === 'all' ? issues : issues.filter((i) => i.kind === kind)

  function open(key: string) {
    const entry = state.activeFile?.entries.find((e) => e.key === key)
    if (!entry) return
    dispatch({ type: 'SET_STATUS_FILTER', payload: 'all' })
    dispatch({ type: 'SET_ACTIVE_ENTRY', payload: entry })
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <AlertTriangle size={13} className="text-yellow-400" /> QA ({issues.length})
        </span>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {(['all', 'tokens', 'english', 'length', 'glossary'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] transition-colors',
              kind === k ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {k === 'all' ? 'Все' : `${QA_KIND_LABEL[k]} ${counts[k]}`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Проблем не найдено.</p>
        ) : (
          <ul>
            {visible.map((issue, i) => (
              <li key={`${issue.key}-${issue.kind}-${i}`}>
                <button
                  onClick={() => open(issue.key)}
                  className={cn(
                    'w-full border-b border-border/50 px-3 py-2 text-left hover:bg-accent/10',
                    state.activeEntry?.key === issue.key && 'bg-accent/20',
                  )}
                >
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{issue.key}</div>
                  <div className="text-xs text-foreground/90">
                    <span className="mr-1 text-yellow-400">{QA_KIND_LABEL[issue.kind]}:</span>
                    {issue.message}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
