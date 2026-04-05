import { useEffect, useRef, useCallback, useState } from 'react'
import { Copy, CheckCheck, Star, Sparkles, Settings2, X, AlertCircle, RefreshCw, Zap } from 'lucide-react'
import { useEditor } from '@/store/EditorContext'
import { useProject } from '@/store/ProjectContext'
import { upsertTranslationFile, getGeminiSettings, getProjectGeminiPrompt } from '@/db/operations'
import { DEFAULT_SYSTEM_PROMPT } from '@/services/geminiService'
import { ColorCodePreview } from './ColorCodePreview'
import { GeminiSettingsDialog } from './GeminiSettingsDialog'
import { autoTranslateFile, GeminiError, RETRY_DELAYS_S, type TranslateProgress } from '@/services/geminiService'
import { autoTranslateFree, type FreeTranslateProgress, type FreeTranslateResult } from '@/services/freeGeminiService'
import { filterEntries } from '@/utils/progressCalc'
import { cn } from '@/lib/utils'
import type { TranslationEntry, EntryStatus } from '@/types'

const AUTOSAVE_DELAY = 800

// ─── Status button config ─────────────────────────────────────────────────────

const STATUS_BUTTON: Record<EntryStatus, { label: string; activeClass: string; title: string }> = {
  missing:    { label: 'Missing',     activeClass: 'bg-red-500/20 text-red-400 border-red-500/30',       title: '' },
  outdated:   { label: 'Outdated',    activeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', title: '' },
  translated: { label: 'Done',        activeClass: 'bg-green-500/20 text-green-400 border-green-500/30',  title: 'Mark as not translated' },
  approved:   { label: '★ Approved',  activeClass: 'bg-blue-400/20 text-blue-400 border-blue-400/30',    title: 'Revoke approval' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AIActionsProps {
  isTranslating: boolean
  isFreeTranslating: boolean
  translateProgress: TranslateProgress | null
  freeProgress: FreeTranslateProgress | null
  onAutoTranslate: () => void
  onFreeAutoTranslate: () => void
  onOpenSettings: () => void
}

function AIActions({
  isTranslating, isFreeTranslating, translateProgress, freeProgress,
  onAutoTranslate, onFreeAutoTranslate, onOpenSettings,
}: AIActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onAutoTranslate}
        disabled={isTranslating || isFreeTranslating}
        className={cn(
          'flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors',
          isTranslating
            ? 'cursor-not-allowed border-primary/20 bg-primary/10 text-primary/60'
            : 'border-primary/30 bg-primary/15 text-primary hover:bg-primary/25',
        )}
        title="Авто-перевод через Gemini (платный API)"
      >
        <Sparkles size={11} />
        {isTranslating
          ? `${translateProgress!.currentChunk}/${translateProgress!.totalChunks}`
          : 'Auto'}
      </button>

      <button
        onClick={onFreeAutoTranslate}
        disabled={isFreeTranslating || isTranslating}
        className={cn(
          'flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors',
          isFreeTranslating
            ? 'cursor-not-allowed border-yellow-500/20 bg-yellow-500/10 text-yellow-400/60'
            : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
        )}
        title="Авто-перевод через бесплатный Gemini API (gemini-2.0-flash)"
      >
        <Zap size={11} />
        {isFreeTranslating
          ? freeProgress!.type === 'rpm_wait'
            ? `Лимит... ${freeProgress!.secondsLeft}с`
            : `${freeProgress!.current}/${freeProgress!.total}`
          : 'Free Auto'}
      </button>

      <button
        onClick={onOpenSettings}
        className="flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
        title="Настройки Gemini API"
      >
        <Settings2 size={11} />
      </button>
    </div>
  )
}

interface EntryActionsProps {
  entry: TranslationEntry
  onCopyOriginal: () => void
  onMarkDone: () => void
  onMarkApproved: () => void
  onToggleUntranslated: () => void
}

function EntryActions({ entry, onCopyOriginal, onMarkDone, onMarkApproved, onToggleUntranslated }: EntryActionsProps) {
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

// ─── Main component ───────────────────────────────────────────────────────────

export function TranslationPanel() {
  const { state, dispatch } = useEditor()
  const { dispatch: projectDispatch } = useProject()
  const entry = state.activeEntry

  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef      = useRef<AbortController | null>(null)
  const freeAbortRef  = useRef<AbortController | null>(null)

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

  // ─── Editor state ─────────────────────────────────────────────────────────────

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
            entry.status === 'approved' ? 'border-blue-400/40'
            : entry.status === 'translated' ? 'border-green-500/40'
            : entry.status === 'outdated'   ? 'border-yellow-500/40'
            : 'border-input',
          )}
          autoFocus
        />

        {entry.translatedText && (
          <div className="rounded border border-border bg-muted/30 p-3">
            <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">Preview</div>
            <ColorCodePreview text={entry.translatedText} />
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

// ─── TranslateOverlay ─────────────────────────────────────────────────────────

interface TranslateOverlayProps {
  progress: TranslateProgress | null
  error: string | null
  done: { total: number } | null
  onCancel: () => void
  onDismiss: () => void
}

function TranslateOverlay({ progress, error, done, onCancel, onDismiss }: TranslateOverlayProps) {
  if (!progress && !error && !done) return null
  const isRetrying = !!progress?.retrying

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] rounded-lg border border-border bg-background shadow-2xl p-5 space-y-4">

        {progress && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isRetrying
                  ? <RefreshCw size={14} className="text-yellow-400 animate-spin" />
                  : <Sparkles size={14} className="text-primary animate-pulse" />}
                <span className="text-sm font-semibold">
                  {isRetrying ? 'Повтор запроса...' : 'Перевод через Gemini...'}
                </span>
              </div>
              <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>

            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-300', isRetrying ? 'bg-yellow-400' : 'bg-primary')}
                  style={{ width: `${(progress.currentChunk / progress.totalChunks) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Блок {progress.currentChunk} из {progress.totalChunks}</span>
                <span>{progress.translatedCount} строк переведено</span>
              </div>
            </div>

            {isRetrying && (
              <div className="rounded border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-yellow-400 font-medium">Попытка {progress.retrying!.attempt} из {progress.retrying!.maxAttempts}</span>
                  <span className="text-muted-foreground">повтор через {progress.retrying!.waitSecondsLeft}с</span>
                </div>
                <div className="h-0.5 w-full rounded-full bg-yellow-500/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-yellow-400 transition-all duration-1000"
                    style={{ width: `${(1 - progress.retrying!.waitSecondsLeft / (RETRY_DELAYS_S[progress.retrying!.attempt - 1] ?? 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <>
            <div className="flex items-center gap-2 text-red-400"><AlertCircle size={14} /><span className="text-sm font-semibold">Ошибка перевода</span></div>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex justify-end">
              <button onClick={onDismiss} className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Закрыть</button>
            </div>
          </>
        )}

        {done && (
          <>
            <div className="flex items-center gap-2 text-green-400"><CheckCheck size={14} /><span className="text-sm font-semibold">Перевод завершён</span></div>
            <p className="text-sm text-muted-foreground">Переведено строк: <span className="font-medium text-foreground">{done.total}</span></p>
            <div className="flex justify-end">
              <button onClick={onDismiss} className="rounded border border-primary/30 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Готово</button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ─── FreeTranslateOverlay ─────────────────────────────────────────────────────

interface FreeTranslateOverlayProps {
  progress: FreeTranslateProgress | null
  error: string | null
  done: FreeTranslateResult | null
  onCancel: () => void
  onDismiss: () => void
}

function FreeTranslateOverlay({ progress, error, done, onCancel, onDismiss }: FreeTranslateOverlayProps) {
  if (!progress && !error && !done) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] rounded-lg border border-border bg-background shadow-2xl p-5 space-y-4">

        {progress && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-yellow-400 animate-pulse" />
                <span className="text-sm font-semibold">
                  {progress.type === 'rpm_wait' ? 'Ожидание лимита RPM...' : 'Free Auto перевод...'}
                </span>
              </div>
              <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>

            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-300', progress.type === 'rpm_wait' ? 'bg-yellow-400' : 'bg-yellow-500')}
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Блок {progress.current} из {progress.total}</span>
                {progress.type === 'translating' && <span>{progress.translatedCount} строк переведено</span>}
              </div>
            </div>

            {progress.type === 'rpm_wait' && (
              <div className="rounded border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-[11px] text-yellow-400">
                Достигнут лимит 15 req/min. Продолжим через {progress.secondsLeft} сек...
              </div>
            )}
          </>
        )}

        {error && (
          <>
            <div className="flex items-center gap-2 text-red-400"><AlertCircle size={14} /><span className="text-sm font-semibold">Ошибка перевода</span></div>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex justify-end">
              <button onClick={onDismiss} className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Закрыть</button>
            </div>
          </>
        )}

        {done && (
          <>
            <div className={cn('flex items-center gap-2', done.isComplete ? 'text-green-400' : 'text-yellow-400')}>
              {done.isComplete ? <CheckCheck size={14} /> : <AlertCircle size={14} />}
              <span className="text-sm font-semibold">{done.isComplete ? 'Перевод завершён' : 'Переведено частично'}</span>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Переведено строк: <span className="font-medium text-foreground">{done.total}</span></p>
              {!done.isComplete && <p className="text-yellow-400/80 text-xs">Дневной лимит исчерпан. Продолжите завтра (сброс в 03:00 МСК).</p>}
            </div>
            <div className="flex justify-end">
              <button onClick={onDismiss} className="rounded border border-primary/30 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Готово</button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
