import React, { createContext, useContext, useReducer } from 'react'
import type { GlossaryEntry } from '@/types'

interface GlossaryState {
  entries: GlossaryEntry[]
  isOpen: boolean
}

type GlossaryAction =
  | { type: 'SET_ENTRIES'; payload: GlossaryEntry[] }
  | { type: 'ADD_ENTRY'; payload: GlossaryEntry }
  | { type: 'REMOVE_ENTRY'; payload: string }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'CLOSE_PANEL' }

function glossaryReducer(state: GlossaryState, action: GlossaryAction): GlossaryState {
  switch (action.type) {
    case 'SET_ENTRIES':
      return { ...state, entries: action.payload }
    case 'ADD_ENTRY':
      return { ...state, entries: [...state.entries, action.payload] }
    case 'REMOVE_ENTRY':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.payload) }
    case 'TOGGLE_PANEL':
      return { ...state, isOpen: !state.isOpen }
    case 'CLOSE_PANEL':
      return { ...state, isOpen: false }
    default:
      return state
  }
}

interface GlossaryContextValue {
  state: GlossaryState
  dispatch: React.Dispatch<GlossaryAction>
}

const GlossaryContext = createContext<GlossaryContextValue | null>(null)

export function GlossaryProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(glossaryReducer, {
    entries: [],
    isOpen: false,
  })

  return (
    <GlossaryContext.Provider value={{ state, dispatch }}>
      {children}
    </GlossaryContext.Provider>
  )
}

export function useGlossary() {
  const ctx = useContext(GlossaryContext)
  if (!ctx) throw new Error('useGlossary must be used within GlossaryProvider')
  return ctx
}
