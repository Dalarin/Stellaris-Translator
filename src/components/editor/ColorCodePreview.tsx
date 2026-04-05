import { renderColorCodes } from '@/parser/colorCodes'
import { cn } from '@/lib/utils'

interface Props {
  text: string
  className?: string
  placeholder?: string
}

export function ColorCodePreview({ text, className, placeholder }: Props) {
  if (!text) {
    return (
      <span className={cn('text-muted-foreground italic', className)}>
        {placeholder ?? ''}
      </span>
    )
  }

  return (
    <span className={cn('font-mono text-sm leading-relaxed whitespace-pre-wrap', className)}>
      {renderColorCodes(text.replace(/\\n/g, '\n'))}
    </span>
  )
}
