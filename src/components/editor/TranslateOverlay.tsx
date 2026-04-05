import { CheckCheck, AlertCircle, RefreshCw, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RETRY_DELAYS_S, type TranslateProgress } from '@/services/geminiService'

export interface TranslateOverlayProps {
  progress: TranslateProgress | null
  error: string | null
  done: { total: number } | null
  onCancel: () => void
  onDismiss: () => void
}

export function TranslateOverlay({ progress, error, done, onCancel, onDismiss }: TranslateOverlayProps) {
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
