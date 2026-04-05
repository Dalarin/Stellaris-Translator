import React from 'react'
import { renderColorCodes } from '@/parser/colorCodes'
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
function resolveVariables(text: string, entries: TranslationEntry[]): React.ReactNode[] {
  const parts = text.split(/(\$[^$\s]+\$)/g)

  return parts.map((part, i) => {
    const match = part.match(/^\$([^$\s]+)\$$/)
    if (!match) return part

    const key = match[1]
    const entry = entries.find((e) => e.key === key)
    if (!entry) return part

    const resolved = entry.translatedText || entry.originalText
    // Render the resolved value with color codes, wrapped in a subtle highlight
    return (
      <span key={i} className="rounded bg-muted/50 px-0.5 text-muted-foreground/80" title={`$${key}$`}>
        {renderColorCodes(resolved.replace(/\\n/g, '\n'))}
      </span>
    )
  })
}

export function ColorCodePreview({ text, className, placeholder, entries }: Props) {
  if (!text) {
    return (
      <span className={cn('text-muted-foreground italic', className)}>
        {placeholder ?? ''}
      </span>
    )
  }

  const processed = text.replace(/\\n/g, '\n')
  const content = entries && entries.length > 0
    ? resolveVariables(processed, entries)
    : renderColorCodes(processed)

  return (
    <span className={cn('font-mono text-sm leading-relaxed whitespace-pre-wrap', className)}>
      {content}
    </span>
  )
}
