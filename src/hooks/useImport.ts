import { useState, useCallback } from 'react'
import { getGameProfile, type GameProfile } from '@/games'
import { generateId } from '@/utils/idHelpers'
import { upsertTranslationFiles } from '@/db/operations'
import { collectFilesFromInput } from '@/utils/fileHelpers'
import { buildEntryMap } from '@/utils/translationMatcher'
import { buildTranslationMemory } from '@/services/translationPrep'
import {
  buildExistingMap,
  buildGlobalExistingMap,
  buildRuMap,
  emptyReport,
  findExistingFile,
  mergeEntry,
  resolveOptions,
  type ImportOptions,
  type ImportReport,
  type MergeContext,
} from '@/services/importMerge'
import type { TranslationFile, TranslationEntry } from '@/types'

export type { ImportOptions, ImportReport, StaleFile } from '@/services/importMerge'

// ── Progress ──────────────────────────────────────────────────────────────────

export interface ImportProgress {
  phase: 'idle' | 'parsing' | 'saving' | 'done' | 'error'
  current: number
  total: number
  message: string
}

const IDLE_PROGRESS: ImportProgress = { phase: 'idle', current: 0, total: 0, message: '' }

type ParsedFile = ReturnType<GameProfile['parse']>

const baseName = (path: string): string => path.split('/').pop() ?? path

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useImport(projectId: string, game: GameProfile = getGameProfile()) {
  const [progress, setProgress] = useState<ImportProgress>(IDLE_PROGRESS)
  const [report, setReport] = useState<ImportReport | null>(null)

  const importFiles = useCallback(
    async (
      enFiles: Map<string, File>,
      ruFiles: Map<string, File> | null,
      existingFiles: TranslationFile[],
      referenceFiles?: TranslationFile[],
      options?: ImportOptions
    ): Promise<TranslationFile[]> => {
      const resolvedOptions = resolveOptions(options)
      const enPaths = Array.from(enFiles.keys())
      const total = enPaths.length
      const stats = emptyReport()

      try {
        // ── Phase 1: build shared lookup maps ──
        const referenceMap = buildEntryMap(referenceFiles ?? [])
        const globalExistingMap = buildGlobalExistingMap(existingFiles)

        // Project translations beat vanilla when the same English text has both
        const memory = buildTranslationMemory([...existingFiles, ...(referenceFiles ?? [])], game)
        for (const [text, translation] of resolvedOptions.vanillaMemory) {
          if (!memory.has(text)) memory.set(text, translation)
        }

        setProgress({ phase: 'parsing', current: 0, total, message: 'Parsing RU files...' })
        const ruMap =
          ruFiles !== null && ruFiles.size > 0
            ? await buildRuMap(ruFiles, game)
            : new Map<string, TranslationEntry>()

        // ── Phase 2: parse EN + merge ──
        const result: TranslationFile[] = []
        const claimed = new Set<string>()

        for (let i = 0; i < enPaths.length; i++) {
          const enPath = enPaths[i]
          setProgress({
            phase: 'parsing',
            current: i + 1,
            total,
            message: `Parsing ${baseName(enPath)}...`,
          })

          let parsed: ParsedFile
          try {
            parsed = game.parse(await enFiles.get(enPath)!.text())
          } catch {
            continue
          }

          const existingFile = findExistingFile(enPath, existingFiles, claimed)
          if (existingFile) {
            claimed.add(existingFile.id)
            const newKeys = new Set(parsed.entries.map((e) => e.key))
            stats.removedKeys += existingFile.entries.filter((e) => !newKeys.has(e.key)).length
          } else {
            stats.newFiles++
          }

          const ctx: MergeContext = {
            existingMap: buildExistingMap(existingFile),
            globalExistingMap,
            referenceMap,
            ruMap,
            memory,
            options: resolvedOptions,
            game,
          }

          result.push({
            id: existingFile?.id ?? generateId(),
            projectId,
            relativePath: enPath,
            language: parsed.language,
            entries: parsed.entries.map((en) => mergeEntry(en, ctx, stats)),
          })
        }

        // Files from earlier imports that this version no longer contains: keep them
        // (their work is not lost) and let the user decide whether to delete them.
        const stale = existingFiles.filter((f) => !claimed.has(f.id))
        stats.staleFiles = stale.map((f) => ({ id: f.id, path: f.relativePath }))
        stats.files = result.length

        // ── Phase 3: persist ──
        setProgress({ phase: 'saving', current: 0, total: result.length, message: 'Saving to database...' })
        await upsertTranslationFiles(result)

        setProgress({ phase: 'done', current: result.length, total: result.length, message: 'Import complete!' })
        setReport(stats)
        return [...result, ...stale]
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed'
        setProgress({ phase: 'error', current: 0, total, message })
        throw err
      }
    },
    [projectId, game]
  )

  const importFromFileLists = useCallback(
    async (
      enFileList: FileList,
      ruFileList: FileList | null,
      existingFiles: TranslationFile[],
      referenceFiles?: TranslationFile[],
      options?: ImportOptions
    ): Promise<TranslationFile[]> =>
      importFiles(
        collectFilesFromInput(enFileList),
        ruFileList ? collectFilesFromInput(ruFileList) : null,
        existingFiles,
        referenceFiles,
        options
      ),
    [importFiles]
  )

  const importFromDirectories = useCallback(
    async (
      enDir: FileSystemDirectoryHandle,
      ruDir: FileSystemDirectoryHandle | null,
      existingFiles: TranslationFile[],
      referenceFiles?: TranslationFile[],
      options?: ImportOptions
    ): Promise<TranslationFile[]> => {
      const { collectAllFiles } = await import('@/utils/fileHelpers')
      return importFiles(
        await collectAllFiles(enDir),
        ruDir ? await collectAllFiles(ruDir) : null,
        existingFiles,
        referenceFiles,
        options
      )
    },
    [importFiles]
  )

  const reset = useCallback(() => {
    setProgress(IDLE_PROGRESS)
    setReport(null)
  }, [])

  return { progress, report, importFromFileLists, importFromDirectories, reset }
}
