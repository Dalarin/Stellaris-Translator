import { useEffect, useState, useCallback } from 'react'
import { useProject } from '@/store/ProjectContext'
import { useGlossary } from '@/store/GlossaryContext'
import { getProjects, getFilesForProject, getLastProjectId, getGlossaryForProject } from '@/db/operations'
import { Sidebar } from './Sidebar'
import { EditorPane } from '../editor/EditorPane'
import { ProjectDashboard } from '../project/ProjectDashboard'
import { ProgressDashboard } from '../dashboard/ProgressDashboard'
import { SearchDialog } from '../search/SearchDialog'
import { Toaster } from 'sonner'

type View = 'projects' | 'editor' | 'dashboard'

export function AppShell() {
  const { state, dispatch } = useProject()
  const { dispatch: glossaryDispatch } = useGlossary()
  const [view, setView] = useState<View>('projects')
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Session recovery on mount
  useEffect(() => {
    async function recover() {
      try {
        const projects = await getProjects()
        dispatch({ type: 'SET_PROJECTS', payload: projects })

        const lastId = await getLastProjectId()
        if (lastId) {
          const last = projects.find((p) => p.id === lastId)
          if (last) {
            dispatch({ type: 'SET_ACTIVE_PROJECT', payload: last })
            const files = await getFilesForProject(last.id)
            dispatch({ type: 'SET_FILES', payload: files })
            const glossary = await getGlossaryForProject(last.id)
            glossaryDispatch({ type: 'SET_ENTRIES', payload: glossary })
            setView('editor')
          }
        }
      } finally {
        setLoading(false)
      }
    }
    recover()
  }, []) // eslint-disable-line

  // Load glossary when project changes
  useEffect(() => {
    if (!state.activeProject) return
    getGlossaryForProject(state.activeProject.id).then((entries) => {
      glossaryDispatch({ type: 'SET_ENTRIES', payload: entries })
    })
  }, [state.activeProject?.id]) // eslint-disable-line

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault()
        glossaryDispatch({ type: 'TOGGLE_PANEL' })
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [glossaryDispatch])

  const handleProjectOpen = useCallback(() => setView('editor'), [])
  const handleOpenProjects = useCallback(() => setView('projects'), [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — always visible when a project is active or in projects view */}
      {(state.activeProject || view === 'projects') && (
        <Sidebar
          onOpenSearch={() => setSearchOpen(true)}
          onOpenDashboard={() => setView(view === 'dashboard' ? 'editor' : 'dashboard')}
          onOpenProjects={handleOpenProjects}
          currentView={view}
        />
      )}

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === 'projects' && (
          <ProjectDashboard onProjectOpen={handleProjectOpen} />
        )}
        {view === 'editor' && state.activeProject && (
          <EditorPane />
        )}
        {view === 'dashboard' && state.activeProject && (
          <ProgressDashboard />
        )}
      </main>

      {/* Search dialog */}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Toast notifications */}
      <Toaster theme="dark" position="bottom-right" />
    </div>
  )
}
