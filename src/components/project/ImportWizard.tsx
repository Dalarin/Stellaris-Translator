import { useRef, useState } from 'react'
import { FolderOpen, Upload, X, CheckCircle, AlertCircle } from 'lucide-react'
import { useImport } from '@/hooks/useImport'
import { useProject } from '@/store/ProjectContext'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void
}

type Step = 'select' | 'importing' | 'done'

export function ImportWizard({ open, onClose, onDone }: Props) {
  const { state, dispatch } = useProject()
  const projectId = state.activeProject?.id ?? ''
  const { progress, importFromFileLists, importFromDirectories, reset } = useImport(projectId)

  const [step, setStep] = useState<Step>('select')
  const [hasRu, setHasRu] = useState(true)

  const enInputRef = useRef<HTMLInputElement>(null)
  const ruInputRef = useRef<HTMLInputElement>(null)

  const [enSelected, setEnSelected] = useState<string | null>(null)
  const [ruSelected, setRuSelected] = useState<string | null>(null)

  function handleClose() {
    setStep('select')
    setEnSelected(null)
    setRuSelected(null)
    reset()
    onClose()
  }

  async function handleImport() {
    if (!enInputRef.current?.files?.length) return
    setStep('importing')

    try {
      const files = await importFromFileLists(
        enInputRef.current.files,
        hasRu && ruInputRef.current?.files?.length ? ruInputRef.current.files : null,
        state.files
      )

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
      const files = await importFromDirectories(enDir, ruDir, state.files)
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
                  onChange={(e) => setHasRu(e.target.checked)}
                  className="rounded border-border"
                />
                Include existing RU translation (smart import)
              </label>

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
                <span className="text-sm text-foreground">{progress.message}</span>
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
            <div className="flex items-center gap-3 py-2">
              <CheckCircle size={18} className="text-green-400" />
              <div>
                <p className="text-sm font-medium text-foreground">Import complete!</p>
                <p className="text-xs text-muted-foreground">
                  {progress.total} files imported.
                </p>
              </div>
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
