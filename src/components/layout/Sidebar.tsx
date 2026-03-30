import { useState } from 'react'
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Download,
  Upload,
  ChevronLeft,
  BarChart3,
} from 'lucide-react'
import { useProject } from '@/store/ProjectContext'
import { useGlossary } from '@/store/GlossaryContext'
import { useExport } from '@/hooks/useExport'
import { calcTotalStats, calcProgress } from '@/utils/progressCalc'
import { FileTree } from '../filetree/FileTree'
import { ImportWizard } from '../project/ImportWizard'
import { ProgressBar } from '../shared/ProgressBar'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

interface Props {
  onOpenSearch: () => void
  onOpenDashboard: () => void
  onOpenProjects: () => void
  currentView: 'projects' | 'editor' | 'dashboard'
}

export function Sidebar({ onOpenSearch, onOpenDashboard, onOpenProjects, currentView }: Props) {
  const { state } = useProject()
  const { dispatch: glossaryDispatch } = useGlossary()
  const { exporting, exportProject } = useExport()
  const [showImport, setShowImport] = useState(false)

  const totalStats = useMemo(() => calcTotalStats(state.files), [state.files])
  const totalPct = calcProgress(totalStats)

  async function handleExport() {
    if (!state.activeProject || state.files.length === 0) return
    await exportProject(state.activeProject, state.files)
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card">
      {/* Project name */}
      <div className="border-b border-border px-3 py-3">
        {state.activeProject ? (
          <div>
            <button
              onClick={onOpenProjects}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-1"
            >
              <ChevronLeft size={10} /> Projects
            </button>
            <div className="truncate text-sm font-semibold text-foreground">
              {state.activeProject.name}
            </div>
            {totalStats.total > 0 && (
              <div className="mt-1.5">
                <ProgressBar value={totalPct} showLabel size="sm" />
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm font-semibold text-foreground">Stellaris Translator</span>
        )}
      </div>

      {/* Actions */}
      {state.activeProject && (
        <div className="border-b border-border p-2 space-y-0.5">
          <button
            onClick={() => setShowImport(true)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
          >
            <Upload size={13} /> Import Files
          </button>
          <button
            onClick={onOpenSearch}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
          >
            <Search size={13} /> Search <kbd className="ml-auto text-[9px] opacity-50">Ctrl+K</kbd>
          </button>
          <button
            onClick={() => glossaryDispatch({ type: 'TOGGLE_PANEL' })}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
          >
            <BookOpen size={13} /> Glossary <kbd className="ml-auto text-[9px] opacity-50">Ctrl+G</kbd>
          </button>
          <button
            onClick={onOpenDashboard}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
              currentView === 'dashboard'
                ? 'bg-accent/20 text-foreground'
                : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
            )}
          >
            <BarChart3 size={13} /> Progress
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || state.files.length === 0}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} /> {exporting ? 'Exporting...' : 'Export ZIP'}
          </button>
        </div>
      )}

      {/* File tree */}
      {state.activeProject && (
        <div className="flex-1 overflow-y-auto py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Files
          </div>
          <FileTree />
        </div>
      )}

      <ImportWizard
        open={showImport}
        onClose={() => setShowImport(false)}
        onDone={() => {}}
      />
    </aside>
  )
}
