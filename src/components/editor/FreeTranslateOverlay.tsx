import { CheckCheck, AlertCircle, RefreshCw, Zap, KeyRound, WifiOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FreeTranslateProgress, FreeTranslateResult } from '@/services/freeGeminiService'

export interface FreeTranslateOverlayProps {
  progress: FreeTranslateProgress | null
  error: string | null
  done: FreeTranslateResult | null
  onCancel: () => void
  onDismiss: () => void
}

export function FreeTranslateOverlay({ progress, error, done, onCancel, onDismiss }: FreeTranslateOverlayProps) {
  if (!progress && !error && !done) return null

  const titleInfo = progress && (() => {
    switch (progress.type) {
      case 'translating':    return { icon: <Zap size={14} className="text-yellow-400 animate-pulse" />,      text: 'Free Auto перевод...' }
      case 'rpm_wait':       return { icon: <RefreshCw size={14} className="text-yellow-400 animate-spin" />, text: 'Ожидание лимита RPM...' }
      case 'switching_key':  return { icon: <KeyRound size={14} className="text-orange-400 animate-pulse" />, text: progress.reason === 'exhausted' ? 'Ключ исчерпан, переключаю...' : 'Лимит RPM, переключаю ключ...' }
      case 'network_error':  return { icon: <WifiOff size={14} className="text-red-400 animate-pulse" />,    text: 'Сетевая ошибка, повтор...' }
    }
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] rounded-lg border border-border bg-background shadow-2xl p-5 space-y-4">

        {progress && titleInfo && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {titleInfo.icon}
                <span className="text-sm font-semibold">{titleInfo.text}</span>
              </div>
              <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>

            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    progress.type === 'rpm_wait'      ? 'bg-yellow-400' :
                    progress.type === 'switching_key' ? 'bg-orange-400' :
                    progress.type === 'network_error' ? 'bg-red-400' :
                    'bg-yellow-500',
                  )}
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

            {progress.type === 'switching_key' && (
              <div className={cn(
                'rounded border px-3 py-2 text-[11px]',
                progress.reason === 'exhausted'
                  ? 'border-orange-500/20 bg-orange-500/5 text-orange-400'
                  : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400',
              )}>
                {progress.reason === 'exhausted'
                  ? `Ключ #${progress.keyIndex + 1} исчерпал дневной лимит. Переключаю на следующий... (доступно: ${progress.totalKeys - progress.keyIndex - 1} из ${progress.totalKeys})`
                  : `Ключ #${progress.keyIndex + 1} достиг лимита RPM. Пробую следующий ключ...`}
              </div>
            )}

            {progress.type === 'network_error' && (
              <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-400">
                Сетевая ошибка. Повтор {progress.attempt} из {progress.maxAttempts}...
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
