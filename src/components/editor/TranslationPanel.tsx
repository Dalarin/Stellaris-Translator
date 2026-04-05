import { useEffect, useRef, useCallback, useState } from 'react'
import { useEditor } from '@/store/EditorContext'
import { useProject } from '@/store/ProjectContext'
import { upsertTranslationFile, getGeminiSettings, getProjectGeminiPrompt } from '@/db/operations'
import { DEFAULT_SYSTEM_PROMPT } from '@/services/geminiService'
import { ColorCodePreview } from './ColorCodePreview'
import { GeminiSettingsDialog } from './GeminiSettingsDialog'
import { AIActions } from './AIActions'
import { EntryActions } from './EntryActions'
import { TranslateOverlay } from './TranslateOverlay'
import { FreeTranslateOverlay } from './FreeTranslateOverlay'
import { autoTranslateFile, GeminiError, type TranslateProgress } from '@/services/geminiService'
import { autoTranslateFree, type FreeTranslateProgress, type FreeTranslateResult } from '@/services/freeGeminiService'
import { filterEntries } from '@/utils/progressCalc'
import { cn } from '@/lib/utils'
import type { EntryStatus } from '@/types'

const AUTOSAVE_DELAY = 800

const statusBorderClass: Record<EntryStatus, string> = {
  translated: 'border-green-500/40',
  approved:   'border-blue-400/40',
  outdated:   'border-yellow-500/40',
  missing:    'border-input',
}

export function TranslationPanel() {
  const { state, dispatch } = useEditor()
  const { dispatch: projectDispatch } = useProject()
  const entry = state.activeEntry

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef     = useRef<AbortController | null>(null)
  const freeAbortRef = useRef<AbortController | null>(null)

  const [geminiSettingsOpen, setGeminiSettingsOpen] = useState(false)

  const [translateProgress, setTranslateProgress] = useState<TranslateProgress | null>(null)
  const [translateError,    setTranslateError]    = useState<string | null>(null)
  const [translateDone,     setTranslateDone]     = useState<{ total: number } | null>(null)

  const [freeProgress, setFreeProgress] = useState<FreeTranslateProgress | null>(null)
  const [freeError,    setFreeError]    = useState<string | null>(null)
  const [freeDone,     setFreeDone]     = useState<FreeTranslateResult | null>(null)

  // ─── Auto-save ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.dirty || !state.activeFile) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!state.activeFile) return
      await upsertTranslationFile(state.activeFile)
      projectDispatch({ type: 'UPDATE_FILE', payload: state.activeFile })
      dispatch({ type: 'SET_DIRTY', payload: false })
    }, AUTOSAVE_DELAY)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state.dirty, state.activeFile]) // eslint-disable-line

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

  // ─── AI handlers ─────────────────────────────────────────────────────────────

  const applyChunkUpdates = useCallback((updates: Map<string, string>) => {
    for (const [key, text] of updates) {
      dispatch({ type: 'UPDATE_ENTRY_TEXT', payload: { key, text } })
      dispatch({ type: 'MARK_ENTRY_TRANSLATED', payload: key })
    }
  }, [dispatch])

  const handleAutoTranslate = useCallback(async () => {
    if (!state.activeFile) return
    const [settings, savedPrompt] = await Promise.all([
      getGeminiSettings(),
      getProjectGeminiPrompt(state.activeFile.projectId),
    ])
    if (!settings?.apiKey) { setGeminiSettingsOpen(true); return }

    setTranslateError(null)
    setTranslateDone(null)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const result = await autoTranslateFile(
        state.activeFile.entries,
        settings.apiKey,
        settings.model,
        savedPrompt ?? DEFAULT_SYSTEM_PROMPT,
        state.activeFile.relativePath,
        (p) => setTranslateProgress(p),
        applyChunkUpdates,
        ctrl.signal,
      )
      setTranslateDone(result)
    } catch (err) {
      if (!ctrl.signal.aborted) setTranslateError(GeminiError.from(err).userMessage)
    } finally {
      setTranslateProgress(null)
      abortRef.current = null
    }
  }, [state.activeFile, applyChunkUpdates])

  const handleFreeAutoTranslate = useCallback(async () => {
    if (!state.activeFile) return
    const [settings, savedPrompt] = await Promise.all([
      getGeminiSettings(),
      getProjectGeminiPrompt(state.activeFile.projectId),
    ])
    const freeApiKeys = settings?.freeApiKeys?.filter((k) => k.trim()) ?? []
    if (freeApiKeys.length === 0) { setGeminiSettingsOpen(true); return }

    setFreeError(null)
    setFreeDone(null)
    const ctrl = new AbortController()
    freeAbortRef.current = ctrl
    try {
      const result = await autoTranslateFree(
        state.activeFile.entries,
        freeApiKeys,
        savedPrompt ?? DEFAULT_SYSTEM_PROMPT,
        state.activeFile.relativePath,
        (p) => setFreeProgress(p),
        applyChunkUpdates,
        ctrl.signal,
      )
      setFreeDone(result)
    } catch (err) {
      if (!ctrl.signal.aborted) setFreeError(GeminiError.from(err).userMessage)
    } finally {
      setFreeProgress(null)
      freeAbortRef.current = null
    }
  }, [state.activeFile, applyChunkUpdates])

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

  const isTranslating     = translateProgress !== null
  const isFreeTranslating = freeProgress !== null

  const dialogs = (
    <>
      {geminiSettingsOpen && <GeminiSettingsDialog onClose={() => setGeminiSettingsOpen(false)} />}
      <TranslateOverlay
        progress={translateProgress}
        error={translateError}
        done={translateDone}
        onCancel={() => { abortRef.current?.abort(); setTranslateProgress(null); setTranslateError(null) }}
        onDismiss={() => { setTranslateError(null); setTranslateDone(null) }}
      />
      <FreeTranslateOverlay
        progress={freeProgress}
        error={freeError}
        done={freeDone}
        onCancel={() => { freeAbortRef.current?.abort(); setFreeProgress(null); setFreeError(null) }}
        onDismiss={() => { setFreeError(null); setFreeDone(null) }}
      />
    </>
  )

  const aiActions = state.activeFile ? (
    <AIActions
      isTranslating={isTranslating}
      isFreeTranslating={isFreeTranslating}
      translateProgress={translateProgress}
      freeProgress={freeProgress}
      onAutoTranslate={handleAutoTranslate}
      onFreeAutoTranslate={handleFreeAutoTranslate}
      onOpenSettings={() => setGeminiSettingsOpen(true)}
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
          {aiActions}
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
