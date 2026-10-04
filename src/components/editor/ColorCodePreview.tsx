import React from 'react'
import { renderSegments } from '@/parser/colorCodes'
import { useGame } from '@/hooks/useGame'
import type { GameProfile } from '@/games'
import { cn } from '@/lib/utils'
import type { TranslationEntry } from '@/types'

interface Props {
  text: string
  className?: string
  placeholder?: string
  entries?: TranslationEntry[]
}

// Resolves $variable_key$ references by looking up entries.
// Uses translatedText if available, falls back to originalText, otherwise keeps the original $key$ token.
function resolveVariables(text: string, entries: TranslationEntry[], game: GameProfile): React.ReactNode[] {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const parts = text.split(/(\$[^$\s]+\$)/g)

  return parts.map((part, i) => {
    const match = part.match(/^\$([^$\s]+)\$$/)
    if (!match) return part

    // $KEY$ or $KEY|format$ — the part after | is a formatter, not part of the key
    const key = match[1].split('|')[0]
    const entry = byKey.get(key)

    if (!entry) return part

    const resolved = entry.translatedText || entry.originalText


    return (
      <span key={i} className="rounded bg-muted/50 px-0.5 text-muted-foreground/80" title={`$${key}$`}>
        {renderSegments(game.colorSegments(resolved.replace(/\\n/g, '\n')))}
      </span>
    )
  })
}

export function ColorCodePreview({ text, className, placeholder, entries }: Props) {
  const game = useGame()
  if (!text) {
    return (
      <span className={cn('text-muted-foreground italic', className)}>
        {placeholder ?? ''}
      </span>
    )
  }

  const processed = text.replace(/\\n/g, '\n')
  const content = entries && entries.length > 0
    ? resolveVariables(processed, entries, game)
    : renderSegments(game.colorSegments(processed))

  return (
    <span className={cn('font-mono text-sm leading-relaxed whitespace-pre-wrap', className)}>
      {content}
    </span>
  )
}
