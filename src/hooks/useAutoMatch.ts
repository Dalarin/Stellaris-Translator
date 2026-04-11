import { useState, useCallback } from 'react'
import { upsertTranslationFile } from '@/db/operations'
import { buildEntryMap, matchEntry } from '@/utils/translationMatcher'
import type { TranslationFile } from '@/types'

export function useAutoMatch() {
  const [isMatching, setIsMatching] = useState(false)

  /**
   * Tries to fill in translations for all entries in `activeFile`
   * by matching against all other files in the project.
   *
   * Only entries that currently have no translatedText are candidates,
   * but if a key is found in another file with a different originalText,
   * it will be marked 'outdated' regardless of current status.
   */
  const matchFile = useCallback(
    async (
      activeFile: TranslationFile,
      allProjectFiles: TranslationFile[]
    ): Promise<TranslationFile> => {
      setIsMatching(true)
      try {
        const otherFiles = allProjectFiles.filter((f) => f.id !== activeFile.id)
        const referenceMap = buildEntryMap(otherFiles)

        const updatedEntries = activeFile.entries.map((entry) => {
          // Only attempt to fill 'missing' entries; leave 'translated'/'approved' untouched
          if (entry.status !== 'missing') return entry
          return matchEntry(entry, referenceMap)
        })

        const updatedFile: TranslationFile = { ...activeFile, entries: updatedEntries }
        await upsertTranslationFile(updatedFile)
        return updatedFile
      } finally {
        setIsMatching(false)
      }
    },
    []
  )

  return { isMatching, matchFile }
}
