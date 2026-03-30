import { useEditor } from '@/store/EditorContext'
import { EntryList } from './EntryList'
import { OriginalPanel } from './OriginalPanel'
import { TranslationPanel } from './TranslationPanel'
import { GlossaryPanel } from '../glossary/GlossaryPanel'
import { useGlossary } from '@/store/GlossaryContext'
import { ProgressBar } from '../shared/ProgressBar'
import { calcFileStats, calcProgress } from '@/utils/progressCalc'
import { useMemo } from 'react'

export function EditorPane() {
  const { state } = useEditor()
  const { state: glossaryState } = useGlossary()

  const stats = useMemo(
    () => (state.activeFile ? calcFileStats(state.activeFile) : null),
    [state.activeFile]
  )
  const pct = stats ? calcProgress(stats) : 0

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
          {stats && (
            <span className="text-xs text-muted-foreground shrink-0 ml-2">
              {stats.translated}/{stats.total} ({pct}%)
            </span>
          )}
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

        {/* Glossary panel */}
        {glossaryState.isOpen && <GlossaryPanel />}
      </div>
    </div>
  )
}
