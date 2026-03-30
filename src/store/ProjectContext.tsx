import React, { createContext, useContext, useReducer, useCallback } from 'react'
import type { Project, TranslationFile, TreeNode } from '@/types'
import { buildFileTree } from '@/utils/fileHelpers'

interface ProjectState {
  projects: Project[]
  activeProject: Project | null
  files: TranslationFile[]
  fileTree: TreeNode[]
}

type ProjectAction =
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'SET_ACTIVE_PROJECT'; payload: Project | null }
  | { type: 'SET_FILES'; payload: TranslationFile[] }
  | { type: 'UPDATE_FILE'; payload: TranslationFile }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'REMOVE_PROJECT'; payload: string }

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload }
    case 'SET_ACTIVE_PROJECT':
      return { ...state, activeProject: action.payload, files: [], fileTree: [] }
    case 'SET_FILES': {
      const files = action.payload
      return { ...state, files, fileTree: buildFileTree(files) }
    }
    case 'UPDATE_FILE': {
      const files = state.files.map((f) =>
        f.id === action.payload.id ? action.payload : f
      )
      return { ...state, files, fileTree: buildFileTree(files) }
    }
    case 'ADD_PROJECT':
      return { ...state, projects: [action.payload, ...state.projects] }
    case 'REMOVE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        activeProject:
          state.activeProject?.id === action.payload ? null : state.activeProject,
      }
    default:
      return state
  }
}

interface ProjectContextValue {
  state: ProjectState
  dispatch: React.Dispatch<ProjectAction>
  getFileById: (id: string) => TranslationFile | undefined
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, {
    projects: [],
    activeProject: null,
    files: [],
    fileTree: [],
  })

  const getFileById = useCallback(
    (id: string) => state.files.find((f) => f.id === id),
    [state.files]
  )

  return (
    <ProjectContext.Provider value={{ state, dispatch, getFileById }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
