import React from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useProject } from '@/store/ProjectContext'
import { stripColorCodes } from '@/parser/colorCodes'

interface Props {
  text: string
  /** Optional renderer for non-variable text segments */
  children?: (segment: string, index: number) => React.ReactNode
}

const VAR_PATTERN = /(\$[A-Za-z0-9_]+\$)/g

export function VariableHighlight({ text, children }: Props) {
  const { state } = useProject()

  const keyMap = React.useMemo(() => {
    const map = new Map<string, { display: string; isTranslated: boolean }>()

    console.log(map);

    for (const file of state.files) {
      for (const entry of file.entries) {
        if (!map.has(entry.key)) {
          const hasTranslation = !!entry.translatedText
          map.set(entry.key, {
            display: hasTranslation ? entry.translatedText : entry.originalText,
            isTranslated: hasTranslation,
          })
        }
      }
    }
    return map
  }, [state.files])

  const parts = text.split(VAR_PATTERN)

  return (
    <>
      {parts.map((part, i) => {
        const varMatch = part.match(/^\$([A-Za-z0-9_]+)\$$/)
        if (varMatch) {
          const varName = varMatch[1]
          const resolved = keyMap.get(varName)
          const tooltipText = resolved
            ? stripColorCodes(resolved.display)
            : undefined
          const isTranslated = resolved?.isTranslated ?? false

          return (
            <Tooltip.Root key={i} delayDuration={200}>
              <Tooltip.Trigger asChild>
                <span className="rounded bg-sky-500/20 text-sky-300 px-0.5 cursor-help border-b border-dotted border-sky-400/50">
                  {part}
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="z-50 rounded border border-border bg-popover px-2.5 py-1.5 text-xs text-foreground shadow-md max-w-xs"
                  sideOffset={5}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {varName}{isTranslated && <span className="ml-1 text-green-400">translated</span>}
                    </span>
                    <span className="font-mono">
                      {tooltipText ?? <span className="italic text-muted-foreground">key not found</span>}
                    </span>
                  </div>
                  <Tooltip.Arrow className="fill-border" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )
        }

        if (!part) return null
        return (
          <React.Fragment key={i}>
            {children ? children(part, i) : part}
          </React.Fragment>
        )
      })}
    </>
  )
}
