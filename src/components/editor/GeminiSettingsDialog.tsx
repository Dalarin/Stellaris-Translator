import { useState, useEffect } from 'react'
import { X, Key, Save, CheckCheck, Zap, Loader2, Plus, Trash2 } from 'lucide-react'
import { getGeminiSettings, setGeminiSettings, setFreeApiKeys } from '@/db/operations'
import { validateFreeApiKey } from '@/services/freeGeminiService'
import { FREE_RPM, FREE_RPD } from '@/providers/GeminiRateLimiter'
import { cn } from '@/lib/utils'

interface GeminiSettingsDialogProps {
  onClose: () => void
}

type FreeKeyStatus = 'unchecked' | 'valid' | 'invalid' | 'validating'

const STATUS_DOT: Record<FreeKeyStatus, { color: string; label: string }> = {
  unchecked:  { color: 'text-muted-foreground', label: 'Не проверен' },
  valid:      { color: 'text-green-400',        label: 'Действителен' },
  invalid:    { color: 'text-red-400',          label: 'Недействителен' },
  validating: { color: 'text-yellow-400',       label: 'Проверка...' },
}

export function GeminiSettingsDialog({ onClose }: GeminiSettingsDialogProps) {
  const [apiKey, setApiKey]   = useState('')
  const [model,  setModel]    = useState('gemini-3-flash-preview')
  const [saved,  setSaved]    = useState(false)
  const [loading, setLoading] = useState(true)

  // Multiple free API keys
  const [freeKeys,    setFreeKeys]    = useState<string[]>([''])
  const [keyStatuses, setKeyStatuses] = useState<FreeKeyStatus[]>(['unchecked'])

  useEffect(() => {
    getGeminiSettings().then((settings) => {
      if (settings) {
        setApiKey(settings.apiKey)
        setModel(settings.model)
        const keys = settings.freeApiKeys.length ? settings.freeApiKeys : ['']
        setFreeKeys(keys)
        setKeyStatuses(keys.map(() => 'unchecked' as FreeKeyStatus))
      }
      setLoading(false)
    })
  }, [])

  // ─── Key list handlers ───────────────────────────────────────────────────────

  function updateKey(idx: number, value: string) {
    setFreeKeys((k) => k.map((v, i) => (i === idx ? value : v)))
    setKeyStatuses((s) => s.map((v, i) => (i === idx ? 'unchecked' : v)))
  }

  function addKey() {
    setFreeKeys((k) => [...k, ''])
    setKeyStatuses((s) => [...s, 'unchecked'])
  }

  function removeKey(idx: number) {
    if (freeKeys.length === 1) { updateKey(0, ''); return }
    setFreeKeys((k) => k.filter((_, i) => i !== idx))
    setKeyStatuses((s) => s.filter((_, i) => i !== idx))
  }

  async function validateKey(idx: number) {
    const key = freeKeys[idx]?.trim()
    if (!key) return
    setKeyStatuses((s) => s.map((v, i) => (i === idx ? 'validating' : v)))
    const ok = await validateFreeApiKey(key)
    setKeyStatuses((s) => s.map((v, i) => (i === idx ? (ok ? 'valid' : 'invalid') : v)))
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    await setGeminiSettings(apiKey.trim(), model.trim())
    const keysToSave = freeKeys.map((k) => k.trim()).filter(Boolean)
    await setFreeApiKeys(keysToSave)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[480px] max-h-[90vh] flex flex-col rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Key size={13} className="text-muted-foreground" />
            <span className="text-sm font-semibold">Настройки Gemini API</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Загрузка...</p>
          ) : (
            <>
              {/* ── Paid API ── */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Google AI Studio API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    autoFocus
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Получить ключ: aistudio.google.com → Get API key
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Модель</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Например: gemini-3-flash-preview · gemini-2.0-flash · gemini-2.5-flash-preview-04-17
                  </p>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* ── Free API ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap size={12} className="text-yellow-400" />
                    <span className="text-xs font-semibold">Free Gemini API</span>
                    <span className="text-[10px] text-muted-foreground">
                      ({freeKeys.filter((k) => k.trim()).length} ключ(ей))
                    </span>
                  </div>
                  <button
                    onClick={addKey}
                    className="flex items-center gap-1 rounded border border-dashed border-yellow-500/30 px-2 py-0.5 text-[11px] text-yellow-400/70 hover:border-yellow-500/60 hover:text-yellow-400 transition-colors"
                  >
                    <Plus size={10} /> Добавить ключ
                  </button>
                </div>

                <div className="space-y-2">
                  {freeKeys.map((key, idx) => (
                    <FreeKeyRow
                      key={idx}
                      index={idx}
                      value={key}
                      status={keyStatuses[idx] ?? 'unchecked'}
                      canRemove={freeKeys.length > 1}
                      onChange={(v) => updateKey(idx, v)}
                      onValidate={() => validateKey(idx)}
                      onRemove={() => removeKey(idx)}
                    />
                  ))}
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Модель: gemini-2.5-flash (free tier). Лимиты: {FREE_RPM} req/min, {FREE_RPD} req/day.
                  При 429 автоматически переключается на следующий ключ.
                  Сброс в 03:00 МСК.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3 shrink-0">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || !model.trim()}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors',
              saved
                ? 'border-green-500/30 bg-green-500/20 text-green-400'
                : 'border-primary/30 bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed',
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

// ─── FreeKeyRow ───────────────────────────────────────────────────────────────

interface FreeKeyRowProps {
  index: number
  value: string
  status: FreeKeyStatus
  canRemove: boolean
  onChange: (v: string) => void
  onValidate: () => void
  onRemove: () => void
}

function FreeKeyRow({ index, value, status, canRemove, onChange, onValidate, onRemove }: FreeKeyRowProps) {
  const dot = STATUS_DOT[status]
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-3 shrink-0">{index + 1}</span>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="AIzaSy..."
          className="flex-1 rounded border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={onValidate}
          disabled={!value.trim() || status === 'validating'}
          className="rounded border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {status === 'validating' ? <Loader2 size={11} className="animate-spin" /> : 'Check'}
        </button>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-red-400 shrink-0 transition-colors"
            title="Удалить ключ"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {value.trim() && (
        <div className={cn('flex items-center gap-1 pl-5 text-[10px]', dot.color)}>
          <span className="text-[7px]">●</span>
          {dot.label}
        </div>
      )}
    </div>
  )
}
