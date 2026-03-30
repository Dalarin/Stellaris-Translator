import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useProject } from '@/store/ProjectContext'
import { useEditor } from '@/store/EditorContext'
import { useSearch, highlightMatch } from '@/hooks/useSearch'
import { StatusBadge } from '../shared/StatusBadge'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

export function SearchDialog({ open, onClose }: Props) {
  const { state: projectState, getFileById } = useProject()
  const { dispatch: editorDispatch } = useEditor()
  const { options, results, setQuery, setSearchIn, setStatusFilter } = useSearch(
    projectState.files
  )
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setActiveIdx(0)
    }
  }, [open])

  useEffect(() => {
    setActiveIdx(0)
  }, [results])

  function handleNavigate(resultIdx: number) {
    const result = results[resultIdx]
    if (!result) return
    const file = getFileById(result.fileId)
    if (!file) return
    editorDispatch({ type: 'SET_ACTIVE_FILE', payload: file })
    editorDispatch({ type: 'SET_ACTIVE_ENTRY', payload: result.entry })
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      handleNavigate(activeIdx)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-16"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
        {/* Input row */}
        <div className="flex items-center border-b border-border px-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={options.query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search keys, original text, translations..."
            className="flex-1 bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {options.query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          {(['all', 'keys', 'original', 'translation'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSearchIn(v)}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors',
                options.searchIn === v
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
          <div className="h-3 w-px bg-border mx-1" />
          {(['all', 'missing', 'outdated', 'translated'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors',
                options.statusFilter === v
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!options.query ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Type to search across all files
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No results for "{options.query}"
            </div>
          ) : (
            results.map((result, idx) => {
              const textToShow =
                result.matchField === 'key'
                  ? result.entry.key
                  : result.matchField === 'original'
                  ? result.entry.originalText
                  : result.entry.translatedText
              const hl = highlightMatch(textToShow, options.query)

              return (
                <button
                  key={`${result.fileId}-${result.entry.key}-${idx}`}
                  onClick={() => handleNavigate(idx)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/10',
                    idx === activeIdx && 'bg-accent/20'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="truncate text-[10px] text-muted-foreground">
                        {result.filePath.split('/').pop()}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {result.entry.key}
                      </span>
                      <StatusBadge status={result.entry.status} />
                    </div>
                    <div className="text-xs text-foreground truncate">
                      {hl ? (
                        <>
                          {hl.before}
                          <mark className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
                            {hl.match}
                          </mark>
                          {hl.after}
                        </>
                      ) : (
                        textToShow
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
          {results.length === 300 && (
            <div className="border-t border-border px-4 py-2 text-center text-[10px] text-muted-foreground">
              Showing first 300 results. Refine your search.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
