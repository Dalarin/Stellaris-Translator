import { useCallback, useEffect, useRef } from 'react'
import { useEditor } from '@/store/EditorContext'
import { useProject } from '@/store/ProjectContext'
import { getTranslationFile, upsertTranslationFile } from '@/db/operations'
import { applyTranslations } from '@/services/translationPrep'
import type { TranslationFile } from '@/types'

/**
 * Applies AI translations to a specific file — not to whatever file is open now — and
 * persists immediately. Applications are queued so parallel chunks never clobber each other.
 */
export function useApplyTranslations() {
  const { state, dispatch } = useEditor()
  const { dispatch: projectDispatch } = useProject()

  // Long-running translations outlive renders; read the latest editor file via a ref
  const activeFileRef = useRef<TranslationFile | null>(state.activeFile)
  useEffect(() => { activeFileRef.current = state.activeFile }, [state.activeFile])

  const queueRef = useRef<Promise<void>>(Promise.resolve())

  const apply = useCallback(
    (fileId: string, updates: Map<string, string>): Promise<void> => {
      queueRef.current = queueRef.current.then(async () => {
        if (updates.size === 0) return
        let base: TranslationFile | undefined =
          activeFileRef.current?.id === fileId ? activeFileRef.current : await getTranslationFile(fileId)
        // The user may have opened the file while we awaited the DB
        if (activeFileRef.current?.id === fileId) base = activeFileRef.current
        if (!base) return

        const updated: TranslationFile = { ...base, entries: applyTranslations(base.entries, updates) }
        if (activeFileRef.current?.id === fileId) {
          activeFileRef.current = updated
          dispatch({ type: 'SYNC_FILE', payload: updated })
        }
        projectDispatch({ type: 'UPDATE_FILE', payload: updated })
        await upsertTranslationFile(updated)
      })
      return queueRef.current
    },
    [dispatch, projectDispatch],
  )

  /** Waits until every queued application has been written. */
  const flush = useCallback(() => queueRef.current, [])

  /** Newest version of a file: the editor's (maybe unsaved) copy if it is open, else the DB's. */
  const getLatest = useCallback(
    async (fileId: string): Promise<TranslationFile | undefined> =>
      activeFileRef.current?.id === fileId ? activeFileRef.current : getTranslationFile(fileId),
    [],
  )

  return { apply, flush, getLatest }
}
