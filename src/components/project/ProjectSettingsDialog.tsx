import { useState, useEffect } from 'react'
import { X, Save, CheckCheck, RotateCcw, SlidersHorizontal } from 'lucide-react'
import {
  getProjectGeminiPrompt,
  setProjectGeminiPrompt,
  getProjectTranslateSettings,
  setProjectTranslateSettings,
} from '@/db/operations'
import { DEFAULT_TRANSLATE_SETTINGS } from '@/services/translateTypes'
import { getGameProfile, type GameId } from '@/games'
import type { TranslateSettings, ThinkingSetting } from '@/types'
import { cn } from '@/lib/utils'

const fieldClass =
  'w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

interface ProjectSettingsDialogProps {
  projectId: string
  projectName: string
  game?: GameId
  onClose: () => void
}

export function ProjectSettingsDialog({
  projectId,
  projectName,
  game: gameId,
  onClose,
}: ProjectSettingsDialogProps) {
  const [systemPrompt, setSystemPrompt] = useState('')
  const [tSettings, setTSettings] = useState<TranslateSettings>(DEFAULT_TRANSLATE_SETTINGS)
  const game = getGameProfile(gameId)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getProjectGeminiPrompt(projectId), getProjectTranslateSettings(projectId)]).then(
      ([prompt, translateSettings]) => {
        setSystemPrompt(prompt ?? game.defaultPrompt)
        setTSettings(translateSettings)
        setLoading(false)
      },
    )
  }, [projectId, game])

  async function handleSave() {
    await setProjectGeminiPrompt(projectId, systemPrompt)
    await setProjectTranslateSettings(projectId, {
      ...tSettings,
      chunkChars: Math.min(60000, Math.max(2000, tSettings.chunkChars || DEFAULT_TRANSLATE_SETTINGS.chunkChars)),
      concurrency: Math.min(8, Math.max(1, tSettings.concurrency || 1)),
    })
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
            <span className="text-sm text-muted-foreground">— {projectName} · {game.name}</span>
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
                  onClick={() => setSystemPrompt(game.defaultPrompt)}
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
                Контекст соседних строк, старые переводы обновлённых строк и предложения для глоссария добавляются автоматически.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Размер блока (символов)</span>
                  <input
                    type="number" min={2000} max={60000} step={1000}
                    value={tSettings.chunkChars}
                    onChange={(e) => setTSettings({ ...tSettings, chunkChars: parseInt(e.target.value, 10) || 0 })}
                    className={fieldClass}
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    Больше — меньше запросов, но выше риск пропусков (они дозапрашиваются).
                  </span>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Параллельных запросов</span>
                  <input
                    type="number" min={1} max={8}
                    value={tSettings.concurrency}
                    onChange={(e) => setTSettings({ ...tSettings, concurrency: parseInt(e.target.value, 10) || 0 })}
                    className={fieldClass}
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    Только платный API. При ошибках 429 уменьшите.
                  </span>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Уровень размышлений</span>
                  <select
                    value={tSettings.thinking}
                    onChange={(e) => setTSettings({ ...tSettings, thinking: e.target.value as ThinkingSetting })}
                    className={fieldClass}
                  >
                    <option value="default">По умолчанию модели</option>
                    <option value="minimal">Minimal</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High (дороже и медленнее)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Температура</span>
                  <input
                    type="number" min={0} max={2} step={0.1}
                    placeholder="по умолчанию"
                    value={tSettings.temperature ?? ''}
                    onChange={(e) =>
                      setTSettings({
                        ...tSettings,
                        temperature: e.target.value === '' ? null : parseFloat(e.target.value),
                      })
                    }
                    className={fieldClass}
                  />
                  <span className="block text-[11px] text-muted-foreground">Пусто — значение модели.</span>
                </label>
              </div>
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
