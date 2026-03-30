import { useEffect, useState } from 'react'
import { Plus, FolderOpen, Trash2, Clock } from 'lucide-react'
import { useProject } from '@/store/ProjectContext'
import { getProjects, getFilesForProject, setLastProjectId, deleteProject } from '@/db/operations'
import { NewProjectDialog } from './NewProjectDialog'
import { calcTotalStats, calcProgress } from '@/utils/progressCalc'
import { ProgressBar } from '../shared/ProgressBar'
import type { Project } from '@/types'

interface Props {
  onProjectOpen: () => void
}

export function ProjectDashboard({ onProjectOpen }: Props) {
  const { state, dispatch } = useProject()
  const [showNew, setShowNew] = useState(false)
  const [stats, setStats] = useState<Record<string, { pct: number; total: number }>>({})

  useEffect(() => {
    getProjects().then((projects) => dispatch({ type: 'SET_PROJECTS', payload: projects }))
  }, []) // eslint-disable-line

  useEffect(() => {
    async function loadStats() {
      const result: Record<string, { pct: number; total: number }> = {}
      for (const p of state.projects) {
        const files = await getFilesForProject(p.id)
        const s = calcTotalStats(files)
        result[p.id] = { pct: calcProgress(s), total: s.total }
      }
      setStats(result)
    }
    if (state.projects.length > 0) loadStats()
  }, [state.projects])

  async function openProject(project: Project) {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project })
    const files = await getFilesForProject(project.id)
    dispatch({ type: 'SET_FILES', payload: files })
    await setLastProjectId(project.id)
    onProjectOpen()
  }

  async function handleDelete(e: React.MouseEvent, projectId: string) {
    e.stopPropagation()
    if (!confirm('Delete this project and all its translations?')) return
    await deleteProject(projectId)
    dispatch({ type: 'REMOVE_PROJECT', payload: projectId })
    setStats((s) => { const copy = { ...s }; delete copy[projectId]; return copy })
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent px-8 py-10">
        <h1 className="text-2xl font-bold text-foreground">Stellaris Translator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Localisation tool for Stellaris mods — smart import, glossary, live preview
        </p>
      </div>

      <div className="p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Projects</h2>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded bg-primary/20 px-3 py-1.5 text-xs text-primary hover:bg-primary/30 transition-colors"
          >
            <Plus size={13} /> New Project
          </button>
        </div>

        {state.projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
            <FolderOpen size={32} className="mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-3 rounded border border-primary/30 px-4 py-1.5 text-xs text-primary hover:bg-primary/10"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.projects.map((project) => {
              const s = stats[project.id]
              return (
                <button
                  key={project.id}
                  onClick={() => openProject(project)}
                  className="group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-foreground">{project.name}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock size={10} />
                        {new Date(project.updatedAt).toLocaleDateString()}
                        {s && <span>· {s.total} strings</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, project.id)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {s && (
                    <ProgressBar value={s.pct} showLabel size="sm" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <NewProjectDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={onProjectOpen}
      />
    </div>
  )
}
