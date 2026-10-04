import { useEffect, useRef } from 'react'
import { useEditor } from '@/store/EditorContext'
import { useProject } from '@/store/ProjectContext'
import { upsertTranslationFile } from '@/db/operations'

const AUTOSAVE_DELAY = 800

/** Persists the open file shortly after the last edit. */
export function useAutosave(): void {
  const { state, dispatch } = useEditor()
  const { dispatch: projectDispatch } = useProject()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.dirty || !state.activeFile) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!state.activeFile) return
      await upsertTranslationFile(state.activeFile)
      projectDispatch({ type: 'UPDATE_FILE', payload: state.activeFile })
      dispatch({ type: 'SET_DIRTY', payload: false })
    }, AUTOSAVE_DELAY)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state.dirty, state.activeFile]) // eslint-disable-line
}
