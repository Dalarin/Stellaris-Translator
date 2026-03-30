import React from 'react'
import type { GlossaryEntry } from '@/types'

interface Props {
  text: string
  entries: GlossaryEntry[]
}

interface Interval {
  start: number
  end: number
  targetTerm: string
}

function findIntervals(text: string, entries: GlossaryEntry[]): Interval[] {
  const lower = text.toLowerCase()
  const intervals: Interval[] = []

  for (const entry of entries) {
    const term = entry.sourceTerm.toLowerCase()
    if (!term) continue
    let idx = 0
    while ((idx = lower.indexOf(term, idx)) !== -1) {
      intervals.push({ start: idx, end: idx + term.length, targetTerm: entry.targetTerm })
      idx += term.length
    }
  }

  // Sort by start, then by length descending (longest match wins)
  intervals.sort((a, b) => a.start - b.start || b.end - a.end)

  // Remove overlaps
  const result: Interval[] = []
  let lastEnd = 0
  for (const iv of intervals) {
    if (iv.start >= lastEnd) {
      result.push(iv)
      lastEnd = iv.end
    }
  }

  return result
}

export function GlossaryHighlight({ text, entries }: Props) {
  if (!entries.length) return <>{text}</>

  const intervals = findIntervals(text, entries)
  if (!intervals.length) return <>{text}</>

  const nodes: React.ReactNode[] = []
  let pos = 0

  for (const iv of intervals) {
    if (iv.start > pos) nodes.push(text.slice(pos, iv.start))
    nodes.push(
      <mark
        key={iv.start}
        className="rounded bg-yellow-500/20 text-yellow-300 px-0.5"
        title={`→ ${iv.targetTerm}`}
      >
        {text.slice(iv.start, iv.end)}
      </mark>
    )
    pos = iv.end
  }

  if (pos < text.length) nodes.push(text.slice(pos))

  return <>{nodes}</>
}
