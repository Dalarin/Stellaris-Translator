import { useEditor } from '@/store/EditorContext'
import { EntryList } from './EntryList'
import { OriginalPanel } from './OriginalPanel'
import { TranslationPanel } from './TranslationPanel'
import { GlossaryPanel } from '../glossary/GlossaryPanel'
import { useGlossary } from '@/store/GlossaryContext'
import { ProgressBar } from '../shared/ProgressBar'
import { calcFileStats, calcProgress } from '@/utils/progressCalc'
import { useMemo, useState } from 'react'
import { QaPanel } from './QaPanel'
import { checkEntries } from '@/utils/qaChecks'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EditorPane() {
  const { state } = useEditor()
  const { state: glossaryState } = useGlossary()

  const stats = useMemo(
    () => (state.activeFile ? calcFileStats(state.activeFile) : null),
    [state.activeFile]
  )
  const pct = stats ? calcProgress(stats) : 0

  const [qaOpen, setQaOpen] = useState(false)
  const qaIssues = useMemo(
    () => (state.activeFile && qaOpen ? checkEntries(state.activeFile.entries, glossaryState.entries) : []),
    [state.activeFile, glossaryState.entries, qaOpen],
  )

  if (!state.activeFile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">No file selected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a file from the sidebar to start translating
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col flex-1 overflow-hidden">
      {/* File header + progress */}
      <div className="border-b border-border px-4 py-2 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {state.activeFile.relativePath.split('/').pop()}
          </span>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button
              onClick={() => setQaOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors',
                qaOpen ? 'bg-yellow-500/20 text-yellow-400' : 'text-muted-foreground hover:text-foreground',
              )}
              title="Проверка качества: переменные, английский, длина, глоссарий"
            >
              <AlertTriangle size={12} /> QA{qaOpen ? ` (${qaIssues.length})` : ''}
            </button>
            {stats && (
              <span className="text-xs text-muted-foreground">
                {stats.translated}/{stats.total} ({pct}%)
              </span>
            )}
          </div>
        </div>
        {stats && <ProgressBar value={pct} />}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Entry list */}
        <EntryList />

        {/* Two-panel editor */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <OriginalPanel />
          </div>
          <div className="flex-1 overflow-hidden border-l border-border">
            <TranslationPanel />
          </div>
        </div>

        {qaOpen && <QaPanel issues={qaIssues} onClose={() => setQaOpen(false)} />}

        {/* Glossary panel */}
        {glossaryState.isOpen && <GlossaryPanel />}
      </div>
    </div>
  )
}
