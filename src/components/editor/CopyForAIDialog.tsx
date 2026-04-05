import { useState, useMemo } from 'react'
import { X, Copy, CheckCheck, Wand2 } from 'lucide-react'
import type { TranslationEntry } from '@/types'
import { cn } from '@/lib/utils'

const IDEAL_MIN = 4000
const IDEAL_MAX = 6000

interface CopyForAIDialogProps {
  entries: TranslationEntry[]
  onClose: () => void
}

interface CategoryGroup {
  key: string
  name: string | null
  entries: TranslationEntry[]
  lineCount: number
  charCount: number
  // char cost per entry (precomputed)
  entryCosts: number[]
}

// 'all' = whole category, number = first N entries
type Selection = Map<string, 'all' | number>

function entryLine(e: TranslationEntry): string {
  const indexPart = e.index !== null && !isNaN(e.index) ? `:${e.index}` : ''
  const escaped = e.originalText
  return ` ${e.key}${indexPart} "${escaped}"\n`
}

function buildGroups(entries: TranslationEntry[]): CategoryGroup[] {
  const map = new Map<string, TranslationEntry[]>()
  for (const entry of entries) {
    const k = entry.category ?? '__uncategorized__'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(entry)
  }
  return Array.from(map.entries()).map(([key, groupEntries]) => {
    const name = key === '__uncategorized__' ? null : key
    const headerCost = name ? ` ## ${name}\n`.length : 0
    const entryCosts = groupEntries.map((e) => entryLine(e).length)
    const charCount = headerCost + entryCosts.reduce((a, b) => a + b, 0)
    const lineCount = groupEntries.length + (name ? 1 : 0)
    return { key, name, entries: groupEntries, lineCount, charCount, entryCosts }
  })
}

function calcPartialCost(group: CategoryGroup, n: number): number {
  const headerCost = group.name ? ` ## ${group.name}\n`.length : 0
  return headerCost + group.entryCosts.slice(0, n).reduce((a, b) => a + b, 0)
}

function calcTotals(groups: CategoryGroup[], selected: Selection) {
  let chars = selected.size > 0 ? 'l_english:\n'.length : 0
  let lines = 0
  for (const g of groups) {
    const sel = selected.get(g.key)
    if (sel === undefined) continue
    const n = sel === 'all' ? g.entries.length : sel
    chars += calcPartialCost(g, n)
    lines += n + (g.name ? 1 : 0)
  }
  return { chars, lines }
}

function formatAsYML(groups: CategoryGroup[], selected: Selection): string {
  const parts: string[] = ['l_english:\n']
  for (const group of groups) {
    const sel = selected.get(group.key)
    if (sel === undefined) continue
    const slice = sel === 'all' ? group.entries : group.entries.slice(0, sel)
    if (group.name) parts.push(` ## ${group.name}\n`)
    for (const entry of slice) parts.push(entryLine(entry))
  }
  return parts.join('')
}

function applyFilter(groups: CategoryGroup[], onlyUntranslated: boolean): CategoryGroup[] {
  if (!onlyUntranslated) return groups
  return groups
    .map((g) => {
      const filtered = g.entries.filter((e) => e.status !== 'translated' && e.status !== 'approved')
      if (filtered.length === 0) return null
      const headerCost = g.name ? ` ## ${g.name}\n`.length : 0
      const entryCosts = filtered.map((e) => entryLine(e).length)
      const charCount = headerCost + entryCosts.reduce((a, b) => a + b, 0)
      return {
        ...g,
        entries: filtered,
        entryCosts,
        charCount,
        lineCount: filtered.length + (g.name ? 1 : 0),
      } satisfies CategoryGroup
    })
    .filter((g): g is CategoryGroup => g !== null)
}

export function CopyForAIDialog({ entries, onClose }: CopyForAIDialogProps) {
  const groups = useMemo(() => buildGroups(entries), [entries])
  const [onlyUntranslated, setOnlyUntranslated] = useState(true)
  const [selected, setSelected] = useState<Selection>(() => new Map())
  const [copied, setCopied] = useState(false)

  const filteredGroups = useMemo(
    () => applyFilter(groups, onlyUntranslated),
    [groups, onlyUntranslated]
  )

  const totals = useMemo(() => calcTotals(filteredGroups, selected), [filteredGroups, selected])

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, 'all')
      return next
    })
  }

  function autoSelect() {
    let chars = 'l_english:\n'.length
    const next: Selection = new Map()

    for (const g of filteredGroups) {
      if (chars >= IDEAL_MAX) break
      const remaining = IDEAL_MAX - chars

      if (g.charCount <= remaining) {
        // whole category fits
        next.set(g.key, 'all')
        chars += g.charCount
      } else {
        // category is too large — take as many entries as fit
        const headerCost = g.name ? ` ## ${g.name}\n`.length : 0
        if (headerCost >= remaining) break // not even the header fits
        let used = headerCost
        let n = 0
        for (const cost of g.entryCosts) {
          if (used + cost > remaining) break
          used += cost
          n++
        }
        if (n > 0) {
          next.set(g.key, n)
          chars += used
        }
        break // stop after first split category
      }
    }
    setSelected(next)
  }

  async function handleCopy() {
    const text = formatAsYML(filteredGroups, selected)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusColor =
    totals.chars === 0
      ? 'text-muted-foreground'
      : totals.chars > IDEAL_MAX
        ? 'text-red-400'
        : totals.chars >= IDEAL_MIN
          ? 'text-green-400'
          : 'text-yellow-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[540px] max-h-[80vh] flex flex-col rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <span className="text-sm font-semibold">Copy for AI Translation</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select categories to include · ideal batch: 3 000 – 4 000 chars
            </p>
          </div>
          <button onClick={onClose} className="mt-0.5 text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        {/* Filter toggle */}
        <div className="border-b border-border px-4 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={onlyUntranslated}
              onChange={(e) => {
                setOnlyUntranslated(e.target.checked)
                setSelected(new Map())
              }}
              className="accent-primary"
            />
            Show only untranslated entries
          </label>
        </div>

        {/* Category list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No entries to show</p>
          ) : (
            filteredGroups.map((group) => {
              const sel = selected.get(group.key)
              const isSelected = sel !== undefined
              const isPartial = typeof sel === 'number'
              const selectedN = isPartial ? sel : (isSelected ? group.entries.length : 0)

              return (
                <label
                  key={group.key}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded px-3 py-2 transition-colors hover:bg-muted/50',
                    isSelected && !isPartial && 'bg-primary/10 border border-primary/20',
                    isPartial && 'bg-yellow-500/10 border border-yellow-500/20',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(group.key)}
                    className="accent-primary shrink-0"
                  />
                  <span className="flex-1 truncate text-sm">
                    {group.name ?? '(no category)'}
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                    {isPartial ? (
                      <span className="text-yellow-400 font-medium">
                        {selectedN}/{group.entries.length} lines
                      </span>
                    ) : (
                      <span>{group.lineCount} lines</span>
                    )}
                    <span className="ml-1.5 opacity-60">{group.charCount.toLocaleString()} ch</span>
                  </span>
                </label>
              )
            })
          )}
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-2">
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                totals.chars > IDEAL_MAX ? 'bg-red-500' : totals.chars >= IDEAL_MIN ? 'bg-green-500' : 'bg-primary'
              )}
              style={{ width: `${Math.min(100, (totals.chars / IDEAL_MAX) * 100)}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {selected.size} {selected.size === 1 ? 'category' : 'categories'} selected
            </span>
            <span className={cn('font-mono font-medium', statusColor)}>
              {totals.lines} lines · {totals.chars.toLocaleString()} chars
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={autoSelect}
              className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Wand2 size={11} />
              Auto-select
            </button>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCopy}
              disabled={selected.size === 0}
              className={cn(
                'flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors',
                selected.size === 0
                  ? 'cursor-not-allowed border-border opacity-40 text-muted-foreground'
                  : 'border-primary/30 bg-primary/20 text-primary hover:bg-primary/30'
              )}
            >
              {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy YML'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
