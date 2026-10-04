import { useEffect, useCallback } from 'react'
import { useEditor } from '@/store/EditorContext'
import { useProject } from '@/store/ProjectContext'
import { useAutoMatch } from '@/hooks/useAutoMatch'
import { useAutosave } from '@/hooks/useAutosave'
import { useAiTranslate } from '@/hooks/useAiTranslate'
import { ColorCodePreview } from './ColorCodePreview'
import { GeminiSettingsDialog } from './GeminiSettingsDialog'
import { AIActions } from './AIActions'
import { EntryActions } from './EntryActions'
import { TranslateOverlay } from './TranslateOverlay'
import { FreeTranslateOverlay } from './FreeTranslateOverlay'
import { filterEntries } from '@/utils/progressCalc'
import { cn } from '@/lib/utils'
import { Wand2, Loader2 } from 'lucide-react'
import type { EntryStatus } from '@/types'

const statusBorderClass: Record<EntryStatus, string> = {
  translated: 'border-green-500/40',
  approved: 'border-blue-400/40',
  outdated: 'border-yellow-500/40',
  missing: 'border-input',
}

export function TranslationPanel() {
  const { state, dispatch } = useEditor()
  const { state: projectState, dispatch: projectDispatch } = useProject()
  const { isMatching, matchFile } = useAutoMatch()
  const entry = state.activeEntry

  useAutosave()
  const ai = useAiTranslate()

  // ─── Entry handlers ──────────────────────────────────────────────────────────

  const advanceToNext = useCallback(
    (predicate: (s: EntryStatus) => boolean) => {
      if (!entry || !state.activeFile) return
      const all = filterEntries(state.activeFile.entries, state.statusFilter)
      const idx = all.findIndex((e) => e.key === entry.key)
      const next = all.slice(idx + 1).find((e) => predicate(e.status)) ?? all.slice(idx + 1)[0]
      if (next) dispatch({ type: 'SET_ACTIVE_ENTRY', payload: next })
    },
    [entry, state.activeFile, state.statusFilter, dispatch],
  )

  const handleTextChange = useCallback(
    (text: string) => { if (entry) dispatch({ type: 'UPDATE_ENTRY_TEXT', payload: { key: entry.key, text } }) },
    [entry, dispatch],
  )

  const handleCopyOriginal = useCallback(() => {
    if (entry) dispatch({ type: 'UPDATE_ENTRY_TEXT', payload: { key: entry.key, text: entry.originalText } })
  }, [entry, dispatch])

  const handleMarkDone = useCallback(() => {
    if (!entry) return
    dispatch({ type: 'MARK_ENTRY_TRANSLATED', payload: entry.key })
    advanceToNext((s) => s !== 'translated' && s !== 'approved')
  }, [entry, dispatch, advanceToNext])

  const handleMarkApproved = useCallback(() => {
    if (!entry) return
    dispatch({ type: 'MARK_ENTRY_APPROVED', payload: entry.key })
    advanceToNext((s) => s !== 'approved')
  }, [entry, dispatch, advanceToNext])

  const handleToggleUntranslated = useCallback(() => {
    if (entry) dispatch({ type: 'MARK_ENTRY_UNTRANSLATED', payload: entry.key })
  }, [entry, dispatch])

  // ─── Auto-match ─────────────────────────────────────────────────────────────

  const handleAutoMatch = useCallback(async () => {
    if (!state.activeFile) return
    const updated = await matchFile(state.activeFile, projectState.files)
    projectDispatch({ type: 'UPDATE_FILE', payload: updated })
    dispatch({ type: 'SET_ACTIVE_FILE', payload: updated })
  }, [state.activeFile, projectState.files, matchFile, projectDispatch, dispatch])

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!entry || !state.activeFile) return
      const entries = state.activeFile.entries
      const idx = entries.findIndex((x) => x.key === entry.key)
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); handleMarkApproved() }
      else if (e.ctrlKey && !e.shiftKey && e.key === 'Enter') { e.preventDefault(); handleMarkDone() }
      else if (e.ctrlKey && e.key === ']') { e.preventDefault(); const n = entries[idx + 1]; if (n) dispatch({ type: 'SET_ACTIVE_ENTRY', payload: n }) }
      else if (e.ctrlKey && e.key === '[') { e.preventDefault(); const p = entries[idx - 1]; if (p) dispatch({ type: 'SET_ACTIVE_ENTRY', payload: p }) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entry, state.activeFile, handleMarkDone, handleMarkApproved, dispatch])

  // ─── Shared overlays & dialogs ───────────────────────────────────────────────

  const dialogs = (
    <>
      {ai.settingsOpen && <GeminiSettingsDialog onClose={ai.closeSettings} />}
      <TranslateOverlay
        progress={ai.paid.progress}
        error={ai.paid.error}
        done={ai.paid.done}
        onCancel={ai.paid.cancel}
        onDismiss={ai.paid.dismiss}
      />
      <FreeTranslateOverlay
        progress={ai.free.progress}
        error={ai.free.error}
        done={ai.free.done}
        onCancel={ai.free.cancel}
        onDismiss={ai.free.dismiss}
      />
    </>
  )

  const autoMatchButton = state.activeFile ? (
    <button
      onClick={handleAutoMatch}
      disabled={isMatching}
      title="Авто-матч: заполнить переводы из других файлов проекта"
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {isMatching ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
    </button>
  ) : null

  const aiActions = state.activeFile ? (
    <AIActions
      isTranslating={ai.paid.progress !== null}
      isFreeTranslating={ai.free.progress !== null}
      translateProgress={ai.paid.progress}
      freeProgress={ai.free.progress}
      onAutoTranslate={ai.paid.start}
      onFreeAutoTranslate={ai.free.start}
      onOpenSettings={ai.openSettings}
    />
  ) : null

  // ─── Empty state ─────────────────────────────────────────────────────────────

  if (!entry) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Translation (RU)
          </span>
          <div className="flex items-center gap-2">
            {autoMatchButton}
            {aiActions}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Select an entry from the list</p>
        </div>
        {dialogs}
      </div>
    )
  }

  // ─── Editor ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Translation (RU)
          </span>
          {state.dirty && <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>}
        </div>
        <div className="flex items-center gap-2">
          {autoMatchButton}
          {aiActions}
          <div className="w-px h-3 bg-border" />
          <EntryActions
            entry={entry}
            onCopyOriginal={handleCopyOriginal}
            onMarkDone={handleMarkDone}
            onMarkApproved={handleMarkApproved}
            onToggleUntranslated={handleToggleUntranslated}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto p-4 space-y-3">
        <textarea
          value={entry.translatedText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Enter translation here..."
          className={cn(
            'w-full min-h-[150px] resize-y rounded border bg-background px-3 py-2 font-mono text-sm text-foreground',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            statusBorderClass[entry.status] ?? 'border-input',
          )}
          autoFocus
        />

        {entry.translatedText && (
          <div className="rounded border border-border bg-muted/30 p-3">
            <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">Preview</div>
            <ColorCodePreview
              text={entry.translatedText}
              entries={state.activeFile?.entries}
            />
          </div>
        )}

        <div className="flex gap-3 text-[10px] text-muted-foreground/60">
          <span><kbd className="font-mono">Ctrl+Enter</kbd> Mark done & next</span>
          <span><kbd className="font-mono">Ctrl+Shift+Enter</kbd> Approve & next</span>
          <span><kbd className="font-mono">Ctrl+]</kbd> Next</span>
          <span><kbd className="font-mono">Ctrl+[</kbd> Prev</span>
        </div>
      </div>

      {dialogs}
    </div>
  )
}
