import { useCallback, useRef, useState } from 'react'
import { useEditor } from '@/store/EditorContext'
import { useProject } from '@/store/ProjectContext'
import { useGlossary } from '@/store/GlossaryContext'
import { useApplyTranslations } from '@/hooks/useApplyTranslations'
import { useGame } from '@/hooks/useGame'
import { useGlossarySuggestions } from '@/hooks/useGlossarySuggestions'
import { getGeminiSettings } from '@/db/operations'
import { loadRunConfig } from '@/services/runConfig'
import { autoTranslateFile } from '@/services/geminiService'
import { autoTranslateFree, type FreeTranslateProgress, type FreeTranslateResult } from '@/services/freeGeminiService'
import { GeminiError } from '@/services/geminiError'
import type { TranslateProgress, TranslateResult } from '@/services/translateTypes'

interface JobContext<P> {
  signal: AbortSignal
  setProgress: (progress: P) => void
}

/** Progress / error / result state and cancellation shared by every translation flow. */
function useTranslateJob<P, R>() {
  const [progress, setProgress] = useState<P | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<R | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(async (task: (ctx: JobContext<P>) => Promise<R>) => {
    setError(null)
    setDone(null)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      setDone(await task({ signal: ctrl.signal, setProgress }))
    } catch (err) {
      if (!ctrl.signal.aborted) setError(GeminiError.from(err).userMessage)
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setProgress(null)
    setError(null)
  }, [])

  const dismiss = useCallback(() => {
    setError(null)
    setDone(null)
  }, [])

  return { progress, error, done, run, cancel, dismiss }
}

/** Auto-translation of the open file through the paid or the free Gemini API. */
export function useAiTranslate() {
  const { state } = useEditor()
  const { state: projectState } = useProject()
  const { state: glossaryState } = useGlossary()
  const game = useGame()
  const { startRun: startGlossaryRun } = useGlossarySuggestions(state.activeFile?.projectId)
  const { apply, flush } = useApplyTranslations()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const paid = useTranslateJob<TranslateProgress, TranslateResult>()
  const free = useTranslateJob<FreeTranslateProgress, FreeTranslateResult>()

  const loadConfig = useCallback(
    (file: NonNullable<typeof state.activeFile>) =>
      loadRunConfig(
        file.projectId,
        game,
        projectState.files.map((f) => (f.id === file.id ? file : f)),
        glossaryState.entries,
        startGlossaryRun(),
      ),
    [game, projectState.files, glossaryState.entries, startGlossaryRun],
  )

  const startPaid = useCallback(async () => {
    const file = state.activeFile
    if (!file) return
    const settings = await getGeminiSettings()
    if (!settings?.apiKey) { setSettingsOpen(true); return }
    const { basePrompt, options } = await loadConfig(file)

    await paid.run(async ({ signal, setProgress }) => {
      const result = await autoTranslateFile(
        file.entries,
        settings.apiKey,
        settings.model,
        basePrompt,
        file.relativePath,
        setProgress,
        (updates) => { void apply(file.id, updates) },
        signal,
        options,
      )
      await flush()
      return result
    })
  }, [state.activeFile, loadConfig, paid.run, apply, flush]) // eslint-disable-line react-hooks/exhaustive-deps

  const startFree = useCallback(async () => {
    const file = state.activeFile
    if (!file) return
    const settings = await getGeminiSettings()
    const freeApiKeys = settings?.freeApiKeys?.filter((k) => k.trim()) ?? []
    if (freeApiKeys.length === 0) { setSettingsOpen(true); return }
    const { basePrompt, options } = await loadConfig(file)

    await free.run(async ({ signal, setProgress }) => {
      const result = await autoTranslateFree(
        file.entries,
        freeApiKeys,
        basePrompt,
        file.relativePath,
        setProgress,
        (updates) => { void apply(file.id, updates) },
        signal,
        options,
      )
      await flush()
      return result
    })
  }, [state.activeFile, loadConfig, free.run, apply, flush]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    paid: { ...paid, start: startPaid },
    free: { ...free, start: startFree },
  }
}
