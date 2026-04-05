import { useState, useEffect } from 'react'
import { X, Save, CheckCheck, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { getProjectGeminiPrompt, setProjectGeminiPrompt } from '@/db/operations'
import { DEFAULT_SYSTEM_PROMPT } from '@/services/geminiService'
import { cn } from '@/lib/utils'

interface ProjectSettingsDialogProps {
  projectId: string
  projectName: string
  onClose: () => void
}

export function ProjectSettingsDialog({
  projectId,
  projectName,
  onClose,
}: ProjectSettingsDialogProps) {
  const [systemPrompt, setSystemPrompt] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProjectGeminiPrompt(projectId).then((prompt) => {
      setSystemPrompt(prompt ?? DEFAULT_SYSTEM_PROMPT)
      setLoading(false)
    })
  }, [projectId])

  async function handleSave() {
    await setProjectGeminiPrompt(projectId, systemPrompt)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[600px] max-h-[90vh] flex flex-col rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={13} className="text-muted-foreground" />
            <span className="text-sm font-semibold">Настройки проекта</span>
            <span className="text-sm text-muted-foreground">— {projectName}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Загрузка...</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Системный промпт для Gemini
                </label>
                <button
                  onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Сбросить к значению по умолчанию"
                >
                  <RotateCcw size={10} />
                  По умолчанию
                </button>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={18}
                spellCheck={false}
                autoFocus
                className="w-full rounded border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
              />
              <p className="text-[11px] text-muted-foreground">
                Задаёт тон, глоссарий и стиль перевода. Используется при нажатии «Auto» в редакторе.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3 shrink-0">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors',
              saved
                ? 'border-green-500/30 bg-green-500/20 text-green-400'
                : 'border-primary/30 bg-primary/20 text-primary hover:bg-primary/30',
            )}
          >
            {saved ? <CheckCheck size={11} /> : <Save size={11} />}
            {saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
