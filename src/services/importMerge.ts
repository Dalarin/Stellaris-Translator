import { type GameProfile } from '@/games'
import { normalizePath } from '@/utils/fileHelpers'
import { matchEntry } from '@/utils/translationMatcher'
import { isTrivial } from '@/services/translationPrep'
import { similarity } from '@/utils/textDiff'
import type { TranslationFile, TranslationEntry, EntryStatus } from '@/types'

// Pure import logic: how strings of a new mod version are merged with earlier work,
// reference projects, RU files and translation memory. The React side is hooks/useImport.

// ── Report ────────────────────────────────────────────────────────────────────

export interface StaleFile {
  id: string
  path: string
}

export interface ImportReport {
  files: number
  newFiles: number
  entries: number
  /** Existing translation kept as is (English text unchanged) */
  kept: number
  /** English text changed since the translation was made */
  outdated: number
  /** Subset of outdated: small edits (≥85% of words unchanged) */
  minor: number
  /** Translation found under the same key in a different file */
  movedFromOtherFile: number
  fromReference: number
  fromRu: number
  /** Matched by exact English text (renamed keys, vanilla, other files) */
  fromMemory: number
  /** Nothing to translate (only variables, numbers, punctuation) — copied as is */
  trivial: number
  /** Still needs translation */
  missing: number
  /** Keys that were in matched files before but are gone from the new version */
  removedKeys: number
  /** Previously imported files that are absent from this import */
  staleFiles: StaleFile[]
}

export function emptyReport(): ImportReport {
  return {
    files: 0, newFiles: 0, entries: 0, kept: 0, outdated: 0, minor: 0, movedFromOtherFile: 0,
    fromReference: 0, fromRu: 0, fromMemory: 0, trivial: 0, missing: 0, removedKeys: 0, staleFiles: [],
  }
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface ImportOptions {
  markRuAsApproved?: boolean
  /** Official vanilla translations: exact English text → RU (lowest priority) */
  vanillaMemory?: Map<string, string>
}

export interface ResolvedOptions {
  markRuAsApproved: boolean
  vanillaMemory: Map<string, string>
}

export function resolveOptions(options?: ImportOptions): ResolvedOptions {
  return {
    markRuAsApproved: options?.markRuAsApproved ?? false,
    vanillaMemory: options?.vanillaMemory ?? new Map(),
  }
}

// ── Merge strategy (Strategy pattern, OCP) ───────────────────────────────────

type MergeSource = 'existing' | 'existingElsewhere' | 'reference' | 'ru' | 'memory'

export interface MergeContext {
  /** Entries of the matched file from the previous import */
  readonly existingMap: Map<string, TranslationEntry>
  /** Best entry per key across every previously imported file */
  readonly globalExistingMap: Map<string, TranslationEntry>
  readonly referenceMap: Map<string, TranslationEntry>
  readonly ruMap: Map<string, TranslationEntry>
  /** Exact English text → translation (project files, reference project, vanilla) */
  readonly memory: Map<string, string>
  readonly options: ResolvedOptions
  readonly game: GameProfile
}

interface MergeResult {
  entry: TranslationEntry
  source: MergeSource
}

type MergeStrategy = (enEntry: TranslationEntry, ctx: MergeContext) => MergeResult | null

const MINOR_CHANGE_THRESHOLD = 0.85

function outdatedEntry(
  enEntry: TranslationEntry,
  translatedText: string,
  previousOriginalText: string,
): TranslationEntry {
  const minor = similarity(previousOriginalText, enEntry.originalText) >= MINOR_CHANGE_THRESHOLD
  return {
    ...enEntry,
    translatedText,
    status: 'outdated',
    previousOriginalText,
    minorChange: minor || undefined,
  }
}

/**
 * P1 — User's existing work: same file first, then the same key in any other file
 * (the mod may have moved or renamed the file). Preserves approved/translated; marks as
 * outdated if EN text changed, remembering the English text the translation was made for.
 */
const existingEntryStrategy: MergeStrategy = (enEntry, { existingMap, globalExistingMap, options }) => {
  const local = existingMap.get(enEntry.key)
  const existing = local ?? globalExistingMap.get(enEntry.key)
  if (!existing?.translatedText) return null
  const source: MergeSource = local ? 'existing' : 'existingElsewhere'

  if (existing.status === 'outdated') {
    // The translation belongs to previousOriginalText, not to existing.originalText
    const translatedFor = existing.previousOriginalText ?? existing.originalText
    return { source, entry: outdatedEntry(enEntry, existing.translatedText, translatedFor) }
  }
  if (existing.status !== 'translated' && existing.status !== 'approved') return null

  if (existing.originalText !== enEntry.originalText) {
    return { source, entry: outdatedEntry(enEntry, existing.translatedText, existing.originalText) }
  }

  const status: EntryStatus =
    options.markRuAsApproved && existing.status === 'translated' ? 'approved' : existing.status
  return { source, entry: { ...enEntry, translatedText: existing.translatedText, status } }
}

/**
 * P2 — Reference project: reuse translations from another project.
 * Only applies when key + EN text both match.
 */
const referenceProjectStrategy: MergeStrategy = (enEntry, { referenceMap }) => {
  if (referenceMap.size === 0) return null
  const matched = matchEntry(enEntry, referenceMap)
  return matched.status !== 'missing' ? { source: 'reference', entry: matched } : null
}

/**
 * P3 — RU localisation files: pre-fill from an existing translation folder.
 * Index mismatch means EN was updated after the translation was made.
 */
const ruFileStrategy: MergeStrategy = (enEntry, { ruMap, options }) => {
  const ruEntry = ruMap.get(enEntry.key)
  if (!ruEntry) return null

  const status: EntryStatus =
    ruEntry.index === enEntry.index
      ? options.markRuAsApproved ? 'approved' : 'translated'
      : 'outdated'

  return { source: 'ru', entry: { ...enEntry, translatedText: ruEntry.originalText, status } }
}

/**
 * P4 — Translation memory: identical English text translated anywhere we know of
 * (renamed keys, other files, reference project, official vanilla localisation).
 */
const memoryStrategy: MergeStrategy = (enEntry, { memory }) => {
  const known = memory.get(enEntry.originalText)
  if (known === undefined) return null
  return { source: 'memory', entry: { ...enEntry, translatedText: known, status: 'translated' } }
}

/**
 * Ordered priority chain.
 * To add a new source — append a strategy here; no other code changes needed (OCP).
 */
const MERGE_PIPELINE: readonly MergeStrategy[] = [
  existingEntryStrategy,
  referenceProjectStrategy,
  ruFileStrategy,
  memoryStrategy,
]

export function mergeEntry(enEntry: TranslationEntry, ctx: MergeContext, report: ImportReport): TranslationEntry {
  report.entries++

  const result = firstResult(enEntry, ctx)

  if (!result) {
    if (isTrivial(enEntry.originalText, ctx.game)) {
      // Only variables / numbers / punctuation — nothing to translate
      report.trivial++
      return { ...enEntry, status: 'translated', translatedText: enEntry.originalText }
    }
    report.missing++
    return { ...enEntry, status: 'missing', translatedText: '' }
  }

  const { entry, source } = result
  if (entry.status === 'outdated') {
    report.outdated++
    if (entry.minorChange) report.minor++
  } else if (source === 'existing' || source === 'existingElsewhere') {
    report.kept++
  }
  if (source === 'existingElsewhere') report.movedFromOtherFile++
  else if (source === 'reference') report.fromReference++
  else if (source === 'ru') report.fromRu++
  else if (source === 'memory') report.fromMemory++
  return entry
}

function firstResult(enEntry: TranslationEntry, ctx: MergeContext): MergeResult | null {
  for (const strategy of MERGE_PIPELINE) {
    const result = strategy(enEntry, ctx)
    if (result !== null) return result
  }
  return null
}

// ── Pure helpers (SRP) ────────────────────────────────────────────────────────

type ParsedFile = ReturnType<GameProfile['parse']>

export async function buildRuMap(
  ruFiles: Map<string, File>,
  game: GameProfile,
): Promise<Map<string, TranslationEntry>> {
  const map = new Map<string, TranslationEntry>()
  for (const [, file] of ruFiles) {
    try {
      const { entries } = game.parse(await file.text())
      for (const entry of entries) {
        if (!map.has(entry.key)) map.set(entry.key, entry)
      }
    } catch {
      // One bad file must not abort the whole import
    }
  }
  return map
}

const STATUS_RANK: Record<EntryStatus, number> = { approved: 3, translated: 2, outdated: 1, missing: 0 }

/** Best entry per key across files: approved > translated > outdated; first file wins ties. */
export function buildGlobalExistingMap(files: TranslationFile[]): Map<string, TranslationEntry> {
  const map = new Map<string, TranslationEntry>()
  for (const file of files) {
    for (const entry of file.entries) {
      if (!entry.translatedText) continue
      const current = map.get(entry.key)
      if (!current || STATUS_RANK[entry.status] > STATUS_RANK[current.status]) map.set(entry.key, entry)
    }
  }
  return map
}

export function buildExistingMap(file: TranslationFile | undefined): Map<string, TranslationEntry> {
  if (!file) return new Map()
  return new Map(file.entries.map((e) => [e.key, e]))
}

const baseName = (path: string): string => path.split('/').pop() ?? path
const parentDir = (path: string): string => path.split('/').slice(-2, -1)[0] ?? ''

/**
 * Finds the previously imported file for a new EN file: exact path first, then the
 * file name — but only when it is unambiguous (or the parent folder disambiguates).
 * Files already claimed by another EN file are never reused.
 */
export function findExistingFile(
  enPath: string,
  existingFiles: TranslationFile[],
  claimed: Set<string>,
): TranslationFile | undefined {
  const path = normalizePath(enPath).toLowerCase()
  const free = existingFiles.filter((f) => !claimed.has(f.id))

  const exact = free.find((f) => normalizePath(f.relativePath).toLowerCase() === path)
  if (exact) return exact

  const sameName = free.filter(
    (f) => baseName(normalizePath(f.relativePath)).toLowerCase() === baseName(path),
  )
  if (sameName.length === 1) return sameName[0]
  if (sameName.length > 1) {
    const sameDir = sameName.filter(
      (f) => parentDir(normalizePath(f.relativePath)).toLowerCase() === parentDir(path),
    )
    if (sameDir.length === 1) return sameDir[0]
  }
  return undefined
}
