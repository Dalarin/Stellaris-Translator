import { useRef, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEditor } from '@/store/EditorContext'
import { filterEntries } from '@/utils/progressCalc'
import { EntryRow } from './EntryRow'
import type { TranslationEntry } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'missing',    label: 'Missing' },
  { key: 'outdated',   label: 'Outdated' },
  { key: 'translated', label: 'Done' },
  { key: 'approved',   label: 'Approved' },
] as const

export function EntryList() {
  const { state, dispatch } = useEditor()
  const parentRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => {
    if (!state.activeFile) return []
    let filtered = filterEntries(state.activeFile.entries, state.statusFilter)
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase()
      filtered = filtered.filter(
        (e) =>
          e.key.toLowerCase().includes(q) ||
          e.originalText.toLowerCase().includes(q) ||
          e.translatedText.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [state.activeFile, state.statusFilter, state.searchQuery])

  // Group by category for display — build a flat list with category headers
  const rows = useMemo(() => {
    const result: ({ type: 'header'; label: string } | { type: 'entry'; entry: TranslationEntry })[] = []
    let lastCategory: string | null | undefined = undefined
    for (const entry of entries) {
      if (entry.category !== lastCategory) {
        if (entry.category) result.push({ type: 'header', label: entry.category })
        else if (lastCategory !== null) result.push({ type: 'header', label: '—' })
        lastCategory = entry.category
      }
      result.push({ type: 'entry', entry })
    }
    return result
  }, [entries])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].type === 'header' ? 28 : 52),
    overscan: 10,
  })

  // Auto-scroll to active entry
  useEffect(() => {
    if (!state.activeEntry) return
    const idx = rows.findIndex(
      (r) => r.type === 'entry' && r.entry.key === state.activeEntry!.key
    )
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' })
  }, [state.activeEntry]) // eslint-disable-line

  const counts = useMemo(() => {
    if (!state.activeFile) return { all: 0, missing: 0, outdated: 0, translated: 0, approved: 0 }
    const e = state.activeFile.entries
    return {
      all:        e.length,
      missing:    e.filter((x) => x.status === 'missing').length,
      outdated:   e.filter((x) => x.status === 'outdated').length,
      translated: e.filter((x) => x.status === 'translated').length,
      approved:   e.filter((x) => x.status === 'approved').length,
    }
  }, [state.activeFile])

  return (
    <div className="flex h-full flex-col border-r border-border w-64 shrink-0">
      {/* Filter tabs */}
      <div className="flex border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => dispatch({ type: 'SET_STATUS_FILTER', payload: tab.key })}
            className={cn(
              'flex-1 py-1.5 text-xs transition-colors',
              state.statusFilter === tab.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className="ml-1 text-[10px] opacity-60">
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search within file */}
      <div className="border-b border-border p-1.5">
        <input
          value={state.searchQuery}
          onChange={(e) => dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value })}
          placeholder="Filter entries..."
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Virtual list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No entries match the filter.</p>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const row = rows[vItem.index]
              return (
                <div
                  key={vItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  {row.type === 'header' ? (
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                      {row.label}
                    </div>
                  ) : (
                    <EntryRow
                      entry={row.entry}
                      isActive={state.activeEntry?.key === row.entry.key}
                      onClick={() => dispatch({ type: 'SET_ACTIVE_ENTRY', payload: row.entry })}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
