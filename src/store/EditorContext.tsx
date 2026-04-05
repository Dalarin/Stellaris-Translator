import React, { createContext, useContext, useReducer } from 'react'
import type { TranslationFile, TranslationEntry, StatusFilter } from '@/types'

export type { StatusFilter }

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
  | { type: 'MARK_ENTRY_APPROVED'; payload: string }
  | { type: 'MARK_ENTRY_UNTRANSLATED'; payload: string }
  | { type: 'SET_STATUS_FILTER'; payload: StatusFilter }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SYNC_FILE'; payload: TranslationFile }

// ─── Utility types ────────────────────────────────────────────────────────────

type ActionPayload<T extends EditorAction['type']> =
  Extract<EditorAction, { type: T }> extends { payload: infer P } ? P : never

type HandlerMap = {
  [T in EditorAction['type']]: (state: EditorState, payload: ActionPayload<T>) => EditorState
}

// ─── Shared helper ────────────────────────────────────────────────────────────

function patchEntry(
  state: EditorState,
  key: string,
  patch: Partial<TranslationEntry>,
): EditorState {
  if (!state.activeFile) return state

  const entries = state.activeFile.entries.map((e) =>
    e.key === key ? { ...e, ...patch } : e,
  )
  const activeEntry =
    state.activeEntry?.key === key
      ? { ...state.activeEntry, ...patch }
      : state.activeEntry

  return {
    ...state,
    activeFile: { ...state.activeFile, entries },
    activeEntry,
    dirty: true,
  }
}

// ─── Per-action pure handlers ─────────────────────────────────────────────────

const handlers: HandlerMap = {
  SET_ACTIVE_FILE: (state, payload) => ({
    ...state,
    activeFile: payload,
    activeEntry: null,
    dirty: false,
    searchQuery: '',
  }),

  SET_ACTIVE_ENTRY: (state, payload) => ({ ...state, activeEntry: payload }),

  UPDATE_ENTRY_TEXT: (state, payload) =>
    patchEntry(state, payload.key, { translatedText: payload.text }),

  MARK_ENTRY_TRANSLATED: (state, payload) =>
    patchEntry(state, payload, { status: 'translated' }),

  MARK_ENTRY_APPROVED: (state, payload) =>
    patchEntry(state, payload, { status: 'approved' }),

  MARK_ENTRY_UNTRANSLATED: (state, payload) =>
    patchEntry(state, payload, { status: 'missing' }),

  SET_STATUS_FILTER: (state, payload) => ({ ...state, statusFilter: payload }),

  SET_DIRTY: (state, payload) => ({ ...state, dirty: payload }),

  SET_SEARCH_QUERY: (state, payload) => ({ ...state, searchQuery: payload }),

  SYNC_FILE: (state, payload) => ({
    ...state,
    activeFile: payload,
    activeEntry: state.activeEntry
      ? (payload.entries.find((e) => e.key === state.activeEntry!.key) ?? null)
      : null,
    dirty: true,
  }),
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const handler = handlers[action.type] as (
    state: EditorState,
    payload: unknown,
  ) => EditorState
  return handler(state, 'payload' in action ? action.payload : undefined)
}

// ─── Context ──────────────────────────────────────────────────────────────────

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
