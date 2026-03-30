import { useState, useCallback } from 'react'
import { parseFile } from '@/parser/stellarisParser'
import { generateId } from '@/utils/idHelpers'
import { upsertTranslationFiles } from '@/db/operations'
import { collectFilesFromInput } from '@/utils/fileHelpers'
import type { TranslationFile, TranslationEntry } from '@/types'

export interface ImportProgress {
  phase: 'idle' | 'parsing' | 'merging' | 'saving' | 'done' | 'error'
  current: number
  total: number
  message: string
}

export function useImport(projectId: string) {
  const [progress, setProgress] = useState<ImportProgress>({
    phase: 'idle',
    current: 0,
    total: 0,
    message: '',
  })

  const importFiles = useCallback(
    async (
      enFiles: Map<string, File>,
      ruFiles: Map<string, File> | null,
      existingFiles: TranslationFile[]
    ): Promise<TranslationFile[]> => {
      const allEnPaths = Array.from(enFiles.keys())
      const total = allEnPaths.length

      setProgress({ phase: 'parsing', current: 0, total, message: 'Parsing EN files...' })

      const result: TranslationFile[] = []

      // Build lookup of existing files by relativePath to preserve existing translations
      const existingByPath = new Map<string, TranslationFile>()
      for (const f of existingFiles) {
        existingByPath.set(f.relativePath, f)
      }

      for (let i = 0; i < allEnPaths.length; i++) {
        const enPath = allEnPaths[i]
        const enFile = enFiles.get(enPath)!

        setProgress({
          phase: 'parsing',
          current: i + 1,
          total,
          message: `Parsing ${enPath.split('/').pop()}...`,
        })

        let parsed
        try {
          parsed = await parseFile(enFile)
        } catch {
          continue
        }

        // Determine corresponding RU path
        const ruPath = enPath
          .replace(/l_english/g, 'l_russian')
          .replace(/_l_english/g, '_l_russian')

        // Build RU entry map (keyed by entry key)
        const ruEntryMap = new Map<string, TranslationEntry>()
        const ruFile = ruFiles?.get(ruPath)
        if (ruFile) {
          try {
            const ruParsed = await parseFile(ruFile)
            for (const entry of ruParsed.entries) {
              ruEntryMap.set(entry.key, entry)
            }
          } catch {
            // ignore RU parse errors
          }
        }

        // Check existing file for already-translated entries
        const existingFile = existingByPath.get(enPath)
        const existingEntryMap = new Map<string, TranslationEntry>()
        if (existingFile) {
          for (const entry of existingFile.entries) {
            existingEntryMap.set(entry.key, entry)
          }
        }

        // Merge logic
        const entries: TranslationEntry[] = parsed.entries.map((enEntry) => {
          // Priority 1: existing translation in DB (user already worked on it)
          const existing = existingEntryMap.get(enEntry.key)
          if (existing && existing.translatedText && existing.status === 'translated') {
            // Check if original changed since last import
            if (existing.originalText === enEntry.originalText) {
              return { ...enEntry, translatedText: existing.translatedText, status: 'translated' }
            } else {
              return {
                ...enEntry,
                translatedText: existing.translatedText,
                status: 'outdated',
              }
            }
          }

          // Priority 2: match from RU file
          const ruEntry = ruEntryMap.get(enEntry.key)
          if (ruEntry) {
            if (ruEntry.index === enEntry.index) {
              return {
                ...enEntry,
                translatedText: ruEntry.originalText, // "original" of RU file is the translation
                status: 'translated',
              }
            } else {
              // Index mismatch = EN was updated after translation
              return {
                ...enEntry,
                translatedText: ruEntry.originalText,
                status: 'outdated',
              }
            }
          }

          // No translation found
          return { ...enEntry, status: 'missing', translatedText: '' }
        })

        const fileId = existingFile?.id ?? generateId()
        result.push({
          id: fileId,
          projectId,
          relativePath: enPath,
          language: parsed.language,
          entries,
        })
      }

      setProgress({ phase: 'saving', current: 0, total: result.length, message: 'Saving to database...' })
      await upsertTranslationFiles(result)

      setProgress({ phase: 'done', current: result.length, total: result.length, message: 'Import complete!' })
      return result
    },
    [projectId]
  )

  const importFromFileLists = useCallback(
    async (
      enFileList: FileList,
      ruFileList: FileList | null,
      existingFiles: TranslationFile[]
    ): Promise<TranslationFile[]> => {
      const enFiles = collectFilesFromInput(enFileList)
      const ruFiles = ruFileList ? collectFilesFromInput(ruFileList) : null
      return importFiles(enFiles, ruFiles, existingFiles)
    },
    [importFiles]
  )

  const importFromDirectories = useCallback(
    async (
      enDir: FileSystemDirectoryHandle,
      ruDir: FileSystemDirectoryHandle | null,
      existingFiles: TranslationFile[]
    ): Promise<TranslationFile[]> => {
      const { collectAllFiles } = await import('@/utils/fileHelpers')
      const enFiles = await collectAllFiles(enDir)
      const ruFiles = ruDir ? await collectAllFiles(ruDir) : null
      return importFiles(enFiles, ruFiles, existingFiles)
    },
    [importFiles]
  )

  const reset = useCallback(() => {
    setProgress({ phase: 'idle', current: 0, total: 0, message: '' })
  }, [])

  return { progress, importFromFileLists, importFromDirectories, reset }
}
