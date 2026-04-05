import { Sparkles, Zap, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TranslateProgress } from '@/services/geminiService'
import type { FreeTranslateProgress } from '@/services/freeGeminiService'

export interface AIActionsProps {
  isTranslating: boolean
  isFreeTranslating: boolean
  translateProgress: TranslateProgress | null
  freeProgress: FreeTranslateProgress | null
  onAutoTranslate: () => void
  onFreeAutoTranslate: () => void
  onOpenSettings: () => void
}

export function AIActions({
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
          ? freeProgress!.type === 'rpm_wait'      ? `Лимит... ${freeProgress!.secondsLeft}с`
          : freeProgress!.type === 'switching_key' ? `Ключ #${freeProgress!.keyIndex + 1}→`
          : freeProgress!.type === 'network_error' ? `Повтор ${freeProgress!.attempt}/${freeProgress!.maxAttempts}`
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
