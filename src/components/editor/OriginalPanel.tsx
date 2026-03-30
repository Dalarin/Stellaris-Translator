import { useEditor } from '@/store/EditorContext'
import { useGlossary } from '@/store/GlossaryContext'
import { ColorCodePreview } from './ColorCodePreview'
import { GlossaryHighlight } from '../glossary/GlossaryHighlight'
import { VariableHighlight } from './VariableHighlight'
import { StatusBadge } from '../shared/StatusBadge'

export function OriginalPanel() {
  const { state } = useEditor()
  const { state: glossaryState } = useGlossary()
  const entry = state.activeEntry

  if (!entry) {
    return (
      <div className="flex h-full flex-col border-r border-border">
        <div className="border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Original (EN)</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Select an entry to begin</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col border-r border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Original (EN)
        </span>
        <StatusBadge status={entry.status} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Key + category */}
        <div>
          {entry.category && (
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {entry.category}
            </div>
          )}
          <div className="font-mono text-xs text-muted-foreground">
            {entry.key}:{entry.index}
          </div>
        </div>

        {/* Color preview */}
        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">Preview</div>
          <ColorCodePreview
            text={entry.originalText}
            placeholder="(empty)"
          />
        </div>

        {/* Raw text with glossary highlights */}
        <div className="rounded border border-border bg-background p-3">
          <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">Raw text</div>
          <p className="font-mono text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            <VariableHighlight text={entry.originalText}>
              {(segment) => (
                <GlossaryHighlight text={segment} entries={glossaryState.entries} />
              )}
            </VariableHighlight>
          </p>
        </div>

        {/* Outdated: show what changed */}
        {entry.status === 'outdated' && entry.translatedText && (
          <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3">
            <div className="mb-1 text-[10px] font-semibold text-yellow-400 uppercase tracking-wider">
              ⚠ Existing translation (may be outdated)
            </div>
            <p className="font-mono text-sm leading-relaxed text-yellow-200/80 whitespace-pre-wrap break-words">
              {entry.translatedText}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
