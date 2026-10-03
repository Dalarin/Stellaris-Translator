import { useRef, useState, useEffect } from 'react'
import { FolderOpen, Upload, X, CheckCircle, Trash2 } from 'lucide-react'
import { useImport } from '@/hooks/useImport'
import { useProject } from '@/store/ProjectContext'
import {
  getProjects,
  getFilesForProject,
  getVanillaMemory,
  getVanillaMemoryCount,
  replaceVanillaMemory,
  deleteTranslationFiles,
} from '@/db/operations'
import { collectFilesFromInput } from '@/utils/fileHelpers'
import { buildVanillaPairs } from '@/utils/vanilla'
import { cn } from '@/lib/utils'
import type { Project, TranslationFile } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void
}

type Step = 'select' | 'importing' | 'done'

export function ImportWizard({ open, onClose, onDone }: Props) {
  const { state, dispatch } = useProject()
  const projectId = state.activeProject?.id ?? ''
  const { progress, report, importFromFileLists, importFromDirectories, reset } = useImport(projectId)

  const [step, setStep] = useState<Step>('select')
  const [hasRu, setHasRu] = useState(true)
  const [markApproved, setMarkApproved] = useState(false)

  const [vanillaCount, setVanillaCount] = useState(0)
  const [useVanilla, setUseVanilla] = useState(true)
  const [vanillaEnSelected, setVanillaEnSelected] = useState<string | null>(null)
  const [vanillaRuSelected, setVanillaRuSelected] = useState<string | null>(null)
  const [prepMessage, setPrepMessage] = useState('')
  const [staleDeleted, setStaleDeleted] = useState(false)
  const [importedFiles, setImportedFiles] = useState<TranslationFile[]>([])

  const vanillaEnRef = useRef<HTMLInputElement>(null)
  const vanillaRuRef = useRef<HTMLInputElement>(null)
  const enInputRef = useRef<HTMLInputElement>(null)
  const ruInputRef = useRef<HTMLInputElement>(null)

  const [enSelected, setEnSelected] = useState<string | null>(null)
  const [ruSelected, setRuSelected] = useState<string | null>(null)

  const [otherProjects, setOtherProjects] = useState<Project[]>([])
  const [referenceProjectId, setReferenceProjectId] = useState<string>('')
  const [referenceFiles, setReferenceFiles] = useState<TranslationFile[]>([])

  useEffect(() => {
    if (!open) return
    getProjects().then((projects) => {
      setOtherProjects(projects.filter((p) => p.id !== projectId))
    })
    getVanillaMemoryCount().then(setVanillaCount)
  }, [open, projectId])

  async function handleReferenceProjectChange(id: string) {
    setReferenceProjectId(id)
    if (id) {
      const files = await getFilesForProject(id)
      setReferenceFiles(files)
    } else {
      setReferenceFiles([])
    }
  }

  /** Parses newly chosen vanilla folders into the stored memory; returns the memory to use. */
  async function prepareVanillaMemory(): Promise<Map<string, string> | undefined> {
    const enList = vanillaEnRef.current?.files
    const ruList = vanillaRuRef.current?.files
    if (enList?.length && ruList?.length) {
      setPrepMessage('Parsing vanilla localisation...')
      const pairs = await buildVanillaPairs(
        collectFilesFromInput(enList),
        collectFilesFromInput(ruList),
        (done, total) => setPrepMessage(`Parsing vanilla localisation... ${done}/${total}`),
      )
      await replaceVanillaMemory(pairs)
      setVanillaCount(pairs.size)
      setPrepMessage('')
      return useVanilla ? pairs : undefined
    }
    return useVanilla && vanillaCount > 0 ? getVanillaMemory() : undefined
  }

  async function handleDeleteStale() {
    if (!report || report.staleFiles.length === 0) return
    const ids = new Set(report.staleFiles.map((f) => f.id))
    await deleteTranslationFiles([...ids])
    const kept = importedFiles.filter((f) => !ids.has(f.id))
    setImportedFiles(kept)
    dispatch({ type: 'SET_FILES', payload: kept })
    setStaleDeleted(true)
  }

  function handleClose() {
    setStep('select')
    setVanillaEnSelected(null)
    setVanillaRuSelected(null)
    setPrepMessage('')
    setStaleDeleted(false)
    setImportedFiles([])
    setEnSelected(null)
    setRuSelected(null)
    setReferenceProjectId('')
    setReferenceFiles([])
    reset()
    onClose()
  }

  async function handleImport() {
    if (!enInputRef.current?.files?.length) return
    setStep('importing')

    try {
      const vanillaMemory = await prepareVanillaMemory()
      const files = await importFromFileLists(
        enInputRef.current.files,
        hasRu && ruInputRef.current?.files?.length ? ruInputRef.current.files : null,
        state.files,
        referenceFiles.length > 0 ? referenceFiles : undefined,
        { markRuAsApproved: markApproved, vanillaMemory }
      )

      setImportedFiles(files)
      dispatch({ type: 'SET_FILES', payload: files })
      setStep('done')
    } catch (err) {
      console.error(err)
      setStep('select')
    }
  }

  async function handleDirectoryImport() {
    try {
      const enDir = await (window as any).showDirectoryPicker({ mode: 'read' })
      setEnSelected(enDir.name)

      let ruDir = null
      if (hasRu) {
        try {
          ruDir = await (window as any).showDirectoryPicker({ mode: 'read' })
          setRuSelected(ruDir.name)
        } catch {
          // User cancelled RU selection
        }
      }

      setStep('importing')
      const vanillaMemory = await prepareVanillaMemory()
      const files = await importFromDirectories(
        enDir,
        ruDir,
        state.files,
        referenceFiles.length > 0 ? referenceFiles : undefined,
        { markRuAsApproved: markApproved, vanillaMemory }
      )
      setImportedFiles(files)
      dispatch({ type: 'SET_FILES', payload: files })
      setStep('done')
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error(err)
      setStep('select')
    }
  }

  if (!open) return null

  const supportsDirectoryPicker = 'showDirectoryPicker' in window

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Import Files</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {step === 'select' && (
            <>
              <p className="text-sm text-muted-foreground">
                Select the English localisation folder. Optionally select an existing Russian translation folder to pre-fill translations and detect outdated strings.
              </p>

              {/* RU toggle */}
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasRu}
                  onChange={(e) => { setHasRu(e.target.checked); if (!e.target.checked) setMarkApproved(false) }}
                  className="rounded border-border"
                />
                Include existing RU translation (smart import)
              </label>

              {hasRu && (
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer pl-5">
                  <input
                    type="checkbox"
                    checked={markApproved}
                    onChange={(e) => setMarkApproved(e.target.checked)}
                    className="rounded border-border"
                  />
                  Пометить импортированные RU переводы как <span className="text-green-400 font-medium">approved</span>
                </label>
              )}

              {/* File input fallback */}
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    English (EN) localisation folder
                  </label>
                  <div className="relative">
                    <input
                      ref={enInputRef}
                      type="file"
                      /* @ts-ignore */
                      webkitdirectory="true"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const count = e.target.files?.length ?? 0
                        setEnSelected(count > 0 ? `${count} files selected` : null)
                      }}
                      accept=".yml,.yaml"
                    />
                    <button
                      onClick={() => enInputRef.current?.click()}
                      className={cn(
                        'flex w-full items-center gap-2 rounded border px-3 py-2 text-sm transition-colors',
                        enSelected
                          ? 'border-green-500/50 bg-green-500/10 text-green-400'
                          : 'border-input bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      )}
                    >
                      <FolderOpen size={14} />
                      {enSelected ?? 'Select EN folder...'}
                    </button>
                  </div>
                </div>

                {hasRu && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Russian (RU) translation folder (optional)
                    </label>
                    <div className="relative">
                      <input
                        ref={ruInputRef}
                        type="file"
                        /* @ts-ignore */
                        webkitdirectory="true"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const count = e.target.files?.length ?? 0
                          setRuSelected(count > 0 ? `${count} files selected` : null)
                        }}
                        accept=".yml,.yaml"
                      />
                      <button
                        onClick={() => ruInputRef.current?.click()}
                        className={cn(
                          'flex w-full items-center gap-2 rounded border px-3 py-2 text-sm transition-colors',
                          ruSelected
                            ? 'border-green-500/50 bg-green-500/10 text-green-400'
                            : 'border-input bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        )}
                      >
                        <FolderOpen size={14} />
                        {ruSelected ?? 'Select RU folder (optional)...'}
                      </button>
                    </div>
                  </div>
                )}

                {otherProjects.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Взять переводы из другого проекта (опционально)
                    </label>
                    <select
                      value={referenceProjectId}
                      onChange={(e) => handleReferenceProjectChange(e.target.value)}
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">— не выбрано —</option>
                      {otherProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {referenceProjectId && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Переводы будут подставлены по ключу, только если EN-текст совпадает.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2 rounded border border-border/60 p-3">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useVanilla}
                      onChange={(e) => setUseVanilla(e.target.checked)}
                      className="rounded border-border"
                    />
                    Использовать ванильную локализацию как память переводов
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {vanillaCount > 0
                      ? `В базе: ${vanillaCount} строк. Выберите обе папки, чтобы обновить.`
                      : 'Папки localisation/english и localisation/russian из папки игры. Подставляются строки с точно таким же английским текстом.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { ref: vanillaEnRef, sel: vanillaEnSelected, set: setVanillaEnSelected, label: 'Vanilla EN...' },
                      { ref: vanillaRuRef, sel: vanillaRuSelected, set: setVanillaRuSelected, label: 'Vanilla RU...' },
                    ] as const).map((f) => (
                      <div key={f.label}>
                        <input
                          ref={f.ref}
                          type="file"
                          /* @ts-ignore */
                          webkitdirectory="true"
                          multiple
                          className="hidden"
                          accept=".yml,.yaml"
                          onChange={(e) => {
                            const count = e.target.files?.length ?? 0
                            f.set(count > 0 ? `${count} files` : null)
                          }}
                        />
                        <button
                          onClick={() => f.ref.current?.click()}
                          className={cn(
                            'flex w-full items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors',
                            f.sel
                              ? 'border-green-500/50 bg-green-500/10 text-green-400'
                              : 'border-input bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <FolderOpen size={12} />
                          {f.sel ?? f.label}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {supportsDirectoryPicker && (
                  <button
                    onClick={handleDirectoryImport}
                    className="flex w-full items-center justify-center gap-2 rounded border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20 transition-colors"
                  >
                    <FolderOpen size={14} />
                    Use Directory Picker (Chrome/Edge)
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'importing' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3">
                <Upload size={18} className="animate-pulse text-primary" />
                <span className="text-sm text-foreground">{prepMessage || progress.message}</span>
              </div>
              {progress.total > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress.current} / {progress.total} files</span>
                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className="text-green-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Import complete!</p>
                  <p className="text-xs text-muted-foreground">
                    {report?.files ?? progress.total} files, {report?.entries ?? 0} strings
                    {report && report.newFiles > 0 ? ` · ${report.newFiles} new files` : ''}
                  </p>
                </div>
              </div>

              {report && (
                <ul className="space-y-1 rounded border border-border/60 bg-background p-3 text-xs">
                  <ReportRow color="bg-green-500" label="Сохранены существующие переводы" value={report.kept} />
                  <ReportRow color="bg-yellow-500" label="Устарели (английский текст изменился)" value={report.outdated}
                    hint={report.minor > 0 ? `из них мелких правок: ${report.minor}` : undefined} />
                  <ReportRow color="bg-emerald-400" label="Подтянуто по точному тексту (переименованные ключи, vanilla)" value={report.fromMemory} />
                  <ReportRow color="bg-teal-400" label="Найдены в другом файле по ключу" value={report.movedFromOtherFile} />
                  <ReportRow color="bg-sky-400" label="Из RU-файлов" value={report.fromRu} />
                  <ReportRow color="bg-indigo-400" label="Из другого проекта" value={report.fromReference} />
                  <ReportRow color="bg-zinc-400" label="Без текста (переменные/числа), копируются как есть" value={report.trivial} />
                  <ReportRow color="bg-red-500" label="Нужно перевести" value={report.missing} />
                  {report.removedKeys > 0 && (
                    <ReportRow color="bg-zinc-500" label="Ключи, удалённые из мода" value={report.removedKeys} />
                  )}
                </ul>
              )}

              {report && report.staleFiles.length > 0 && !staleDeleted && (
                <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs space-y-2">
                  <p className="text-yellow-400">
                    {report.staleFiles.length} ранее импортированных файлов нет в новой версии мода.
                    Они оставлены, чтобы не потерять работу; переводы из них уже перенесены в новые файлы.
                  </p>
                  <ul className="max-h-20 overflow-y-auto font-mono text-[11px] text-muted-foreground">
                    {report.staleFiles.map((f) => <li key={f.id} className="truncate">{f.path}</li>)}
                  </ul>
                  <button
                    onClick={handleDeleteStale}
                    className="flex items-center gap-1 rounded border border-yellow-500/40 px-2 py-1 text-yellow-400 hover:bg-yellow-500/10"
                  >
                    <Trash2 size={11} /> Удалить эти файлы
                  </button>
                </div>
              )}
              {staleDeleted && <p className="text-xs text-muted-foreground">Устаревшие файлы удалены.</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {step === 'done' ? (
            <button
              onClick={() => { onDone(); handleClose() }}
              className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start Translating
            </button>
          ) : step === 'select' ? (
            <>
              <button onClick={handleClose} className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!enSelected}
                className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ReportRow({ color, label, value, hint }: { color: string; label: string; value: number; hint?: string }) {
  if (value === 0) return null
  return (
    <li className="flex items-start gap-2">
      <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', color)} />
      <span className="flex-1 text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[11px] opacity-70">({hint})</span>}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </li>
  )
}
