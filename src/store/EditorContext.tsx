import React, { createContext, useContext, useReducer } from 'react'
import type { TranslationFile, TranslationEntry } from '@/types'

export type StatusFilter = 'all' | 'translated' | 'outdated' | 'missing'

interface EditorState {
  activeFile: TranslationFile | null
  activeEntry: TranslationEntry | null
  dirty: boolean
  statusFilter: StatusFilter
  searchQuery: string
}

type EditorAction =
  | { type: 'SET_ACTIVE_FILE'; payload: TranslationFile }
  | { type: 'SET_ACTIVE_ENTRY'; payload: TranslationEntry | null }
  | { type: 'UPDATE_ENTRY_TEXT'; payload: { key: string; text: string } }
  | { type: 'MARK_ENTRY_TRANSLATED'; payload: string }
  | { type: 'SET_STATUS_FILTER'; payload: StatusFilter }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SYNC_FILE'; payload: TranslationFile }

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_ACTIVE_FILE':
      return {
        ...state,
        activeFile: action.payload,
        activeEntry: null,
        dirty: false,
        searchQuery: '',
      }
    case 'SET_ACTIVE_ENTRY':
      return { ...state, activeEntry: action.payload }
    case 'UPDATE_ENTRY_TEXT': {
      if (!state.activeFile) return state
      const entries = state.activeFile.entries.map((e) =>
        e.key === action.payload.key
          ? { ...e, translatedText: action.payload.text }
          : e
      )
      const updatedFile = { ...state.activeFile, entries }
      const updatedEntry =
        state.activeEntry?.key === action.payload.key
          ? { ...state.activeEntry, translatedText: action.payload.text }
          : state.activeEntry
      return {
        ...state,
        activeFile: updatedFile,
        activeEntry: updatedEntry,
        dirty: true,
      }
    }
    case 'MARK_ENTRY_TRANSLATED': {
      if (!state.activeFile) return state
      const entries = state.activeFile.entries.map((e) =>
        e.key === action.payload
          ? { ...e, status: 'translated' as const }
          : e
      )
      const updatedFile = { ...state.activeFile, entries }
      const updatedEntry =
        state.activeEntry?.key === action.payload
          ? { ...state.activeEntry, status: 'translated' as const }
          : state.activeEntry
      return {
        ...state,
        activeFile: updatedFile,
        activeEntry: updatedEntry,
        dirty: true,
      }
    }
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.payload }
    case 'SET_DIRTY':
      return { ...state, dirty: action.payload }
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload }
    case 'SYNC_FILE':
      return {
        ...state,
        activeFile: action.payload,
        activeEntry: state.activeEntry
          ? action.payload.entries.find((e) => e.key === state.activeEntry!.key) ?? null
          : null,
      }
    default:
      return state
  }
}

interface EditorContextValue {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, {
    activeFile: null,
    activeEntry: null,
    dirty: false,
    statusFilter: 'all',
    searchQuery: '',
  })

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditor() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}
