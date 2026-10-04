import { useCallback, useEffect, useRef } from 'react'
import { useGlossary } from '@/store/GlossaryContext'
import { upsertGlossaryEntries } from '@/db/operations'
import { generateId } from '@/utils/idHelpers'
import type { GlossarySuggestion } from '@/services/translateTypes'
import type { GlossaryEntry } from '@/types'

/**
 * Turns AI glossary suggestions into 'suggested' glossary entries awaiting review.
 * Skips terms already known in any state (accepted, suggested or rejected), so
 * rejected terms are not suggested again.
 */
export function useGlossarySuggestions(projectId: string | undefined) {
  const { state, dispatch } = useGlossary()

  // Long-running translations outlive renders, so read the latest entries via a ref.
  const entriesRef = useRef(state.entries)
  useEffect(() => { entriesRef.current = state.entries }, [state.entries])

  /** Call once per translation run; returns the callback to pass to the translate service. */
  const startRun = useCallback(() => {
    const seen = new Set(entriesRef.current.map((e) => e.sourceTerm.toLowerCase()))

    return (suggestions: GlossarySuggestion[]): void => {
      if (!projectId) return
      const fresh: GlossaryEntry[] = []
      for (const s of suggestions) {
        const norm = s.sourceTerm.toLowerCase()
        if (seen.has(norm)) continue
        seen.add(norm)
        fresh.push({
          id: generateId(),
          projectId,
          sourceTerm: s.sourceTerm,
          targetTerm: s.targetTerm,
          status: 'suggested',
        })
      }
      if (fresh.length === 0) return
      for (const entry of fresh) dispatch({ type: 'ADD_ENTRY', payload: entry })
      void upsertGlossaryEntries(fresh)
    }
  }, [projectId, dispatch])

  return { startRun }
}
