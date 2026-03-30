import { useEffect, useRef, useCallback } from 'react'
import { Copy, CheckCheck } from 'lucide-react'
import { useEditor } from '@/store/EditorContext'
import { useProject } from '@/store/ProjectContext'
import { upsertTranslationFile } from '@/db/operations'
import { ColorCodePreview } from './ColorCodePreview'
import { filterEntries } from '@/utils/progressCalc'
import { cn } from '@/lib/utils'

const AUTOSAVE_DELAY = 800

export function TranslationPanel() {
  const { state, dispatch } = useEditor()
  const { dispatch: projectDispatch } = useProject()
  const entry = state.activeEntry
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save debounce
  useEffect(() => {
    if (!state.dirty || !state.activeFile) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!state.activeFile) return
      await upsertTranslationFile(state.activeFile)
      projectDispatch({ type: 'UPDATE_FILE', payload: state.activeFile })
      dispatch({ type: 'SET_DIRTY', payload: false })
    }, AUTOSAVE_DELAY)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [state.dirty, state.activeFile]) // eslint-disable-line

  const handleTextChange = useCallback(
    (text: string) => {
      if (!entry) return
      dispatch({ type: 'UPDATE_ENTRY_TEXT', payload: { key: entry.key, text } })
    },
    [entry, dispatch]
  )

  const handleMarkTranslated = useCallback(() => {
    if (!entry || !state.activeFile) return
    dispatch({ type: 'MARK_ENTRY_TRANSLATED', payload: entry.key })
    // Advance to next non-translated entry
    const all = filterEntries(state.activeFile.entries, state.statusFilter)
    const idx = all.findIndex((e) => e.key === entry.key)
    const next =
      all.slice(idx + 1).find((e) => e.status !== 'translated') ??
      all.slice(idx + 1)[0]
    if (next) dispatch({ type: 'SET_ACTIVE_ENTRY', payload: next })
  }, [entry, state.activeFile, state.statusFilter, dispatch])

  const handleCopyOriginal = useCallback(() => {
    if (!entry) return
    dispatch({ type: 'UPDATE_ENTRY_TEXT', payload: { key: entry.key, text: entry.originalText } })
  }, [entry, dispatch])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!entry || !state.activeFile) return
      const entries = state.activeFile.entries
      const idx = entries.findIndex((x) => x.key === entry.key)

      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        handleMarkTranslated()
      } else if (e.ctrlKey && e.key === ']') {
        e.preventDefault()
        const next = entries[idx + 1]
        if (next) dispatch({ type: 'SET_ACTIVE_ENTRY', payload: next })
      } else if (e.ctrlKey && e.key === '[') {
        e.preventDefault()
        const prev = entries[idx - 1]
        if (prev) dispatch({ type: 'SET_ACTIVE_ENTRY', payload: prev })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entry, state.activeFile, handleMarkTranslated, dispatch])

  if (!entry) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Translation (RU)
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Select an entry from the list</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Translation (RU)
        </span>
        <div className="flex items-center gap-1.5">
          {state.dirty && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>
          )}
          <button
            onClick={handleCopyOriginal}
            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
            title="Copy original text to translation field"
          >
            <Copy size={11} /> Copy EN
          </button>
          <button
            onClick={handleMarkTranslated}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors',
              entry.status === 'translated'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
            )}
            title="Mark as translated and advance (Ctrl+Enter)"
          >
            <CheckCheck size={11} />
            {entry.status === 'translated' ? 'Translated' : 'Mark Done'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto p-4 space-y-3">
        {/* Textarea */}
        <textarea
          value={entry.translatedText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Enter translation here..."
          className={cn(
            'w-full min-h-[150px] resize-y rounded border bg-background px-3 py-2 font-mono text-sm text-foreground',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            entry.status === 'translated'
              ? 'border-green-500/40'
              : entry.status === 'outdated'
              ? 'border-yellow-500/40'
              : 'border-input'
          )}
          autoFocus
        />

        {/* Live preview */}
        {entry.translatedText && (
          <div className="rounded border border-border bg-muted/30 p-3">
            <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">Preview</div>
            <ColorCodePreview text={entry.translatedText} />
          </div>
        )}

        {/* Keyboard hints */}
        <div className="flex gap-3 text-[10px] text-muted-foreground/60">
          <span><kbd className="font-mono">Ctrl+Enter</kbd> Mark done & next</span>
          <span><kbd className="font-mono">Ctrl+]</kbd> Next</span>
          <span><kbd className="font-mono">Ctrl+[</kbd> Prev</span>
        </div>
      </div>
    </div>
  )
}
