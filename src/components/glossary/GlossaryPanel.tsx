import { useRef } from 'react'
import { X, Plus, Upload, Trash2 } from 'lucide-react'
import { useGlossary } from '@/store/GlossaryContext'
import { useProject } from '@/store/ProjectContext'
import { generateId } from '@/utils/idHelpers'
import { upsertGlossaryEntries, deleteGlossaryEntry } from '@/db/operations'
import type { GlossaryEntry } from '@/types'
import { cn } from '@/lib/utils'

export function GlossaryPanel() {
  const { state, dispatch } = useGlossary()
  const { state: projectState } = useProject()
  const fileRef = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<HTMLInputElement>(null)

  if (!state.isOpen) return null

  const projectId = projectState.activeProject?.id ?? ''

  async function handleAdd() {
    const source = sourceRef.current?.value.trim()
    const target = targetRef.current?.value.trim()
    if (!source || !target || !projectId) return

    const entry: GlossaryEntry = { id: generateId(), projectId, sourceTerm: source, targetTerm: target }
    dispatch({ type: 'ADD_ENTRY', payload: entry })
    await upsertGlossaryEntries([entry])
    if (sourceRef.current) sourceRef.current.value = ''
    if (targetRef.current) targetRef.current.value = ''
  }

  async function handleRemove(id: string) {
    dispatch({ type: 'REMOVE_ENTRY', payload: id })
    await deleteGlossaryEntry(id)
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !projectId) return

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    const entries: GlossaryEntry[] = []

    for (const line of lines) {
      // Support comma and tab separators
      const parts = line.includes('\t') ? line.split('\t') : line.split(',')
      if (parts.length >= 2) {
        const source = parts[0].trim().replace(/^["']|["']$/g, '')
        const target = parts[1].trim().replace(/^["']|["']$/g, '')
        if (source && target) {
          entries.push({ id: generateId(), projectId, sourceTerm: source, targetTerm: target })
        }
      }
    }

    if (entries.length) {
      for (const entry of entries) dispatch({ type: 'ADD_ENTRY', payload: entry })
      await upsertGlossaryEntries(entries)
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex h-full w-72 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold text-foreground">Glossary</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent/20"
            title="Import CSV/TSV"
          >
            <Upload size={14} />
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleImportCSV} />
          <button
            onClick={() => dispatch({ type: 'CLOSE_PANEL' })}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent/20"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Add entry */}
      <div className="border-b border-border p-2 space-y-1.5">
        <input
          ref={sourceRef}
          placeholder="Source (EN)"
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          ref={targetRef}
          placeholder="Target (RU)"
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="flex w-full items-center justify-center gap-1 rounded bg-primary/20 px-2 py-1 text-xs text-primary hover:bg-primary/30"
        >
          <Plus size={12} /> Add Term
        </button>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto">
        {state.entries.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            No glossary terms. Add terms above or import a CSV file.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">EN</th>
                <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">RU</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {state.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-accent/5">
                  <td className="px-2 py-1.5 text-foreground">{entry.sourceTerm}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{entry.targetTerm}</td>
                  <td className="px-1">
                    <button
                      onClick={() => handleRemove(entry.id)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
