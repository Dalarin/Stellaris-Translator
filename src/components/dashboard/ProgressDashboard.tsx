import { useMemo } from 'react'
import { useProject } from '@/store/ProjectContext'
import { useEditor } from '@/store/EditorContext'
import { calcFileStats, calcProgress, calcTotalStats } from '@/utils/progressCalc'
import { ProgressBar } from '../shared/ProgressBar'
import { cn } from '@/lib/utils'

export function ProgressDashboard() {
  const { state, getFileById } = useProject()
  const { dispatch: editorDispatch } = useEditor()

  const totalStats = useMemo(() => calcTotalStats(state.files), [state.files])
  const totalPct = calcProgress(totalStats)

  const fileRows = useMemo(
    () =>
      state.files
        .map((f) => ({ file: f, stats: calcFileStats(f) }))
        .sort((a, b) => {
          const aUnfinished = a.stats.missing + a.stats.outdated
          const bUnfinished = b.stats.missing + b.stats.outdated
          return bUnfinished - aUnfinished
        }),
    [state.files]
  )

  function openFile(fileId: string) {
    const file = getFileById(fileId)
    if (file) editorDispatch({ type: 'SET_ACTIVE_FILE', payload: file })
  }

  if (state.files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No files imported yet.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Progress Overview</h2>

      {/* Total summary */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Total Progress</span>
          <span className="text-sm text-muted-foreground">
            {totalStats.translated} / {totalStats.total} strings
          </span>
        </div>
        <ProgressBar value={totalPct} showLabel size="md" />
        <div className="mt-3 flex gap-4 text-xs">
          <span className="text-blue-400">★ {totalStats.approved} approved</span>
          <span className="text-green-400">✓ {totalStats.translated} done</span>
          <span className="text-yellow-400">⚠ {totalStats.outdated} outdated</span>
          <span className="text-red-400">✗ {totalStats.missing} missing</span>
        </div>
      </div>

      {/* Per-file table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">File</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Done</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Outdated</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Missing</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Progress</th>
            </tr>
          </thead>
          <tbody>
            {fileRows.map(({ file, stats }) => {
              const pct = calcProgress(stats)
              return (
                <tr
                  key={file.id}
                  onClick={() => openFile(file.id)}
                  className="cursor-pointer border-b border-border/50 hover:bg-accent/10 transition-colors"
                >
                  <td className="px-3 py-2 text-foreground/80 truncate max-w-xs">
                    {file.relativePath.split('/').pop()}
                    <span className="ml-1 text-muted-foreground/50 text-[10px]">
                      {file.relativePath.split('/').slice(0, -1).join('/')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-green-400">{stats.translated}</td>
                  <td className={cn('px-3 py-2 text-right', stats.outdated > 0 ? 'text-yellow-400' : 'text-muted-foreground')}>
                    {stats.outdated}
                  </td>
                  <td className={cn('px-3 py-2 text-right', stats.missing > 0 ? 'text-red-400' : 'text-muted-foreground')}>
                    {stats.missing}
                  </td>
                  <td className="px-3 py-2">
                    <ProgressBar value={pct} outdatedValue={stats.outdated} showLabel size="sm" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
