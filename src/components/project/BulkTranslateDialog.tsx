import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Sparkles, CheckCheck, AlertCircle } from 'lucide-react'
import { useProject } from '@/store/ProjectContext'
import { useGlossary } from '@/store/GlossaryContext'
import { useApplyTranslations } from '@/hooks/useApplyTranslations'
import { useGlossarySuggestions } from '@/hooks/useGlossarySuggestions'
import { getBulkPrices, getGeminiSettings, setBulkPrices } from '@/db/operations'
import { autoTranslateFile, GeminiError } from '@/services/geminiService'
import { loadRunConfig, mergeMemory, type RunConfig } from '@/services/runConfig'
import { estimateCost, estimateRun, sumEstimates, type RunEstimate } from '@/services/estimate'
import { cn } from '@/lib/utils'
import type { TranslationFile } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
}

interface RunState {
  fileIndex: number
  fileCount: number
  fileName: string
  chunk: number
  chunks: number
  translated: number
  failed: number
}

interface RunResult {
  translated: number
  failed: number
  filesDone: number
  error: string | null
  cancelled: boolean
}

const ROW_GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)_6rem_5rem] items-center gap-2 px-2 py-1.5'

const fmt = (n: number): string => n.toLocaleString('ru-RU')

export function BulkTranslateDialog({ open, onClose }: Props) {
  const { state: projectState } = useProject()
  const { state: glossaryState } = useGlossary()
  const { apply, flush, getLatest } = useApplyTranslations()
  const projectId = projectState.activeProject?.id
  const { startRun: startGlossaryRun } = useGlossarySuggestions(projectId)

  const [config, setConfig] = useState<RunConfig | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inputPrice, setInputPrice] = useState('')
  const [outputPrice, setOutputPrice] = useState('')
  const [run, setRun] = useState<RunState | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Load prompt/settings/memory every time the dialog opens
  useEffect(() => {
    if (!open || !projectId) return
    setResult(null)
    loadRunConfig(projectId, projectState.files, glossaryState.entries).then(setConfig)
    getBulkPrices().then((p) => {
      setInputPrice(p?.input ?? '')
      setOutputPrice(p?.output ?? '')
    })
  }, [open, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const estimates = useMemo(() => {
    const map = new Map<string, RunEstimate>()
    if (!config) return map
    for (const f of projectState.files) {
      map.set(f.id, estimateRun(f.entries, config.basePrompt, config.options))
    }
    return map
  }, [config, projectState.files])

  // Pre-select every file that has work to do
  useEffect(() => {
    if (!open) return
    setSelected(new Set([...estimates].filter(([, e]) => e.requests > 0 || e.entriesFree > 0).map(([id]) => id)))
  }, [open, estimates])

  const chosen = projectState.files.filter((f) => selected.has(f.id))
  const total = sumEstimates(chosen.map((f) => estimates.get(f.id)).filter((e): e is RunEstimate => !!e))
  const inPrice = parseFloat(inputPrice.replace(',', '.'))
  const outPrice = parseFloat(outputPrice.replace(',', '.'))
  const hasPrices = Number.isFinite(inPrice) && Number.isFinite(outPrice)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function start() {
    if (!projectId || !config || chosen.length === 0) return
    const settings = await getGeminiSettings()
    if (!settings?.apiKey) {
      setResult({ translated: 0, failed: 0, filesDone: 0, error: 'Укажите платный API-ключ Gemini в настройках.', cancelled: false })
      return
    }
    await setBulkPrices({ input: inputPrice, output: outputPrice })

    const ctrl = new AbortController()
    abortRef.current = ctrl
    const onSuggestions = startGlossaryRun()
    const res: RunResult = { translated: 0, failed: 0, filesDone: 0, error: null, cancelled: false }
    // Local copy of the project so every file benefits from translations made in earlier ones
    const known = new Map(projectState.files.map((f) => [f.id, f]))

    try {
      for (let i = 0; i < chosen.length; i++) {
        if (ctrl.signal.aborted) break
        const file = (await getLatest(chosen[i].id)) ?? chosen[i]
        known.set(file.id, file)
        const options = { ...config.options, memory: mergeMemory([...known.values()], config.vanilla), onGlossarySuggestions: onSuggestions }
        const name = file.relativePath.split('/').pop() ?? file.relativePath
        setRun({ fileIndex: i + 1, fileCount: chosen.length, fileName: name, chunk: 0, chunks: 0, translated: res.translated, failed: res.failed })

        const r = await autoTranslateFile(
          file.entries,
          settings.apiKey,
          settings.model,
          config.basePrompt,
          file.relativePath,
          (p) =>
            setRun({
              fileIndex: i + 1, fileCount: chosen.length, fileName: name,
              chunk: p.currentChunk, chunks: p.totalChunks,
              translated: res.translated + p.translatedCount, failed: res.failed,
            }),
          (updates) => { void apply(file.id, updates) },
          ctrl.signal,
          options,
        )
        await flush()
        if (ctrl.signal.aborted) break
        res.translated += r.total
        res.failed += r.failedKeys.length
        res.filesDone++
        const fresh = await getLatest(file.id)
        if (fresh) known.set(file.id, fresh)
      }
    } catch (err) {
      if (!ctrl.signal.aborted) res.error = GeminiError.from(err).userMessage
    }
    await flush()
    res.cancelled = ctrl.signal.aborted
    abortRef.current = null
    setRun(null)
    setResult(res)
  }

  function close() {
    abortRef.current?.abort()
    setRun(null)
    onClose()
  }

  if (!open) return null

  const withWork = projectState.files.filter((f) => (estimates.get(f.id)?.requests ?? 0) + (estimates.get(f.id)?.entriesFree ?? 0) > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[90vh] w-[680px] flex-col rounded-lg border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <span className="text-sm font-semibold">Перевести проект через Gemini</span>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground"><X size={15} /></button>
        </div>

        {run ? (
          <div className="space-y-3 p-5">
            <p className="text-sm text-foreground">
              Файл {run.fileIndex} из {run.fileCount}: <span className="font-mono text-xs">{run.fileName}</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((run.fileIndex - 1 + (run.chunks ? run.chunk / run.chunks : 0)) / run.fileCount) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{run.chunks > 0 ? `Блок ${run.chunk} из ${run.chunks}` : 'Подготовка...'}</span>
              <span>{fmt(run.translated)} строк переведено{run.failed > 0 ? `, не удалось: ${fmt(run.failed)}` : ''}</span>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => abortRef.current?.abort()}
                className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Остановить
              </button>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-3 p-5">
            <div className={cn('flex items-center gap-2', result.error ? 'text-red-400' : 'text-green-400')}>
              {result.error ? <AlertCircle size={14} /> : <CheckCheck size={14} />}
              <span className="text-sm font-semibold">
                {result.error ? 'Остановлено из-за ошибки' : result.cancelled ? 'Остановлено' : 'Перевод завершён'}
              </span>
            </div>
            {result.error && <p className="text-sm text-muted-foreground">{result.error}</p>}
            <p className="text-sm text-muted-foreground">
              Файлов обработано: <span className="text-foreground">{result.filesDone}</span> · строк переведено:{' '}
              <span className="text-foreground">{fmt(result.translated)}</span>
              {result.failed > 0 && (
                <> · <span className="text-yellow-400">не удалось: {fmt(result.failed)}</span> (пропущены моделью или искажены переменные — запустите ещё раз)</>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">Готовые переводы уже сохранены. Новые термины глоссария ждут решения в панели глоссария.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResult(null)} className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Назад</button>
              <button onClick={close} className="rounded border border-primary/30 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Готово</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {!config ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Подсчёт...</p>
              ) : withWork.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Нечего переводить: все строки уже переведены.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Файлы с непереведёнными строками</span>
                    <span className="flex gap-3">
                      <button className="text-primary hover:underline" onClick={() => setSelected(new Set(withWork.map((f) => f.id)))}>выбрать все</button>
                      <button className="text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>снять все</button>
                    </span>
                  </div>
                  <div className="overflow-hidden rounded border border-border text-xs">
                    <div className={cn(ROW_GRID, 'bg-card font-medium text-muted-foreground')}>
                      <span />
                      <span>Файл</span>
                      <span className="text-right">Строк</span>
                      <span className="text-right">Запросов</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {withWork.map((f: TranslationFile) => {
                        const e = estimates.get(f.id)!
                        return (
                          <label key={f.id} className={cn(ROW_GRID, 'cursor-pointer border-t border-border/50 hover:bg-accent/5')}>
                            <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
                            <span className="truncate font-mono text-[11px] text-foreground" title={f.relativePath}>
                              {f.relativePath.split('/').pop()}
                            </span>
                            <span className="text-right text-muted-foreground">
                              {fmt(e.entriesToTranslate)}
                              {e.entriesFree > 0 && <span className="ml-1 opacity-60" title="Подставятся без запроса">+{fmt(e.entriesFree)}</span>}
                            </span>
                            <span className="text-right text-muted-foreground">{fmt(e.requests)}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1 rounded border border-border bg-card p-3 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">К переводу моделью</span><span>{fmt(total.entriesToTranslate)} строк</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Подставится без запроса (память, дубли, без текста)</span><span>{fmt(total.entriesFree)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Запросов к API</span><span>{fmt(total.requests)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Входных токенов</span><span>≈ {fmt(total.inputTokens)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Выходных токенов (без размышлений)</span><span>≈ {fmt(total.outputTokens)}</span></div>
                    {hasPrices && (
                      <div className="flex justify-between border-t border-border pt-1 font-medium">
                        <span>Оценка стоимости</span>
                        <span>≈ {estimateCost(total, inPrice, outPrice).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Цена за 1M входных токенов
                      <input value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} inputMode="decimal" placeholder="из прайса вашей модели"
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Цена за 1M выходных токенов
                      <input value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} inputMode="decimal" placeholder="из прайса вашей модели"
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Токены считаются приблизительно. Размышления модели оплачиваются как выходные токены сверх этой оценки
                    (зависят от уровня в настройках проекта). Цены я не знаю наверняка — введите их из прайса вашей модели.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-4 py-3 shrink-0">
              <button onClick={close} className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Отмена</button>
              <button
                onClick={start}
                disabled={!config || chosen.length === 0}
                className="rounded border border-primary/30 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 disabled:opacity-40"
              >
                Перевести {chosen.length > 0 ? `(${chosen.length} файлов)` : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
