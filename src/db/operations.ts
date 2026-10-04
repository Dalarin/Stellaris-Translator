import { db } from './schema'
import { DEFAULT_TRANSLATE_SETTINGS } from '@/services/translateTypes'
import { GAMES, DEFAULT_GAME, type GameId } from '@/games'
import type { Project, TranslationFile, GlossaryEntry, TranslateSettings } from '@/types'

// --- Projects ---

export async function getProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function createProject(
  name: string,
  id: string,
  game: GameId = DEFAULT_GAME,
): Promise<Project> {
  const now = new Date()
  const project: Project = { id, name, game, createdAt: now, updatedAt: now }
  await db.projects.add(project)
  return project
}

export async function updateProjectTimestamp(id: string): Promise<void> {
  await db.projects.update(id, { updatedAt: new Date() })
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.translationFiles, db.glossaryEntries, async () => {
    await db.projects.delete(id)
    await db.translationFiles.where('projectId').equals(id).delete()
    await db.glossaryEntries.where('projectId').equals(id).delete()
  })
}

// --- Translation Files ---

export async function getFilesForProject(projectId: string): Promise<TranslationFile[]> {
  return db.translationFiles.where('projectId').equals(projectId).toArray()
}

export async function getTranslationFile(id: string): Promise<TranslationFile | undefined> {
  return db.translationFiles.get(id)
}

export async function deleteTranslationFiles(ids: string[]): Promise<void> {
  await db.translationFiles.bulkDelete(ids)
}

export async function upsertTranslationFile(file: TranslationFile): Promise<void> {
  await db.translationFiles.put(file)
  await updateProjectTimestamp(file.projectId)
}

export async function upsertTranslationFiles(files: TranslationFile[]): Promise<void> {
  if (files.length === 0) return
  await db.transaction('rw', db.translationFiles, db.projects, async () => {
    await db.translationFiles.bulkPut(files)
    if (files[0]) await updateProjectTimestamp(files[0].projectId)
  })
}

// --- Glossary ---

export async function getGlossaryForProject(projectId: string): Promise<GlossaryEntry[]> {
  return db.glossaryEntries.where('projectId').equals(projectId).toArray()
}

export async function upsertGlossaryEntries(entries: GlossaryEntry[]): Promise<void> {
  await db.glossaryEntries.bulkPut(entries)
}

export async function deleteGlossaryEntry(id: string): Promise<void> {
  await db.glossaryEntries.delete(id)
}

// --- Meta (key/value store) ---

async function getMeta(key: string): Promise<string | null> {
  const record = await db.meta.get(key)
  return record?.value ?? null
}

async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

/** Parsed JSON value, or null when missing or corrupt. */
async function getJsonMeta<T>(key: string): Promise<T | null> {
  const raw = await getMeta(key)
  if (raw === null) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

const setJsonMeta = (key: string, value: unknown): Promise<void> => setMeta(key, JSON.stringify(value))

export const getLastProjectId = (): Promise<string | null> => getMeta('lastProjectId')

export const setLastProjectId = (id: string): Promise<void> => setMeta('lastProjectId', id)

// --- Gemini settings ---

export interface GeminiSettings {
  apiKey: string
  model: string
  /** @deprecated use freeApiKeys */
  freeApiKey?: string
  freeApiKeys: string[]
}

export async function getGeminiSettings(): Promise<GeminiSettings | null> {
  const raw = await getJsonMeta<Omit<GeminiSettings, 'freeApiKeys'> & { freeApiKeys?: string[] }>('geminiSettings')
  if (!raw) return null
  // Migrate legacy single-key field
  const freeApiKeys = raw.freeApiKeys?.length
    ? raw.freeApiKeys
    : raw.freeApiKey
      ? [raw.freeApiKey]
      : []
  return { ...raw, freeApiKeys }
}

/** Updates part of the stored settings, keeping the rest. */
async function patchGeminiSettings(
  patch: Partial<Pick<GeminiSettings, 'apiKey' | 'model' | 'freeApiKeys'>>,
): Promise<void> {
  const existing = await getGeminiSettings()
  await setJsonMeta('geminiSettings', {
    apiKey: existing?.apiKey ?? '',
    model: existing?.model ?? '',
    freeApiKeys: existing?.freeApiKeys ?? [],
    ...patch,
  })
}

export const setGeminiSettings = (apiKey: string, model: string): Promise<void> =>
  patchGeminiSettings({ apiKey, model })

export const setFreeApiKeys = (freeApiKeys: string[]): Promise<void> =>
  patchGeminiSettings({ freeApiKeys })

// --- Per-project Gemini system prompt ---

export async function getProjectGeminiPrompt(projectId: string): Promise<string | null> {
  const prompt = await getMeta(`geminiPrompt_${projectId}`)
  if (prompt === null) return null
  // Untouched old default → fall back to the current default prompt
  if (GAMES.some((g) => g.legacyPrompts.includes(prompt))) return null
  return prompt
}

export const setProjectGeminiPrompt = (projectId: string, prompt: string): Promise<void> =>
  setMeta(`geminiPrompt_${projectId}`, prompt)

// --- Per-project translation settings (chunk size, thinking, temperature, concurrency) ---

export async function getProjectTranslateSettings(projectId: string): Promise<TranslateSettings> {
  let stored = await getJsonMeta<Partial<TranslateSettings>>(`translateSettings_${projectId}`)
  if (!stored && (await getMeta(`translateSettings_${projectId}`)) === null) {
    // Settings saved before translateSettings existed only had the chunk size
    const n = parseInt((await getMeta(`chunkChars_${projectId}`)) ?? '', 10)
    if (Number.isFinite(n) && n > 0) stored = { chunkChars: n }
  }
  return { ...DEFAULT_TRANSLATE_SETTINGS, ...stored }
}

export const setProjectTranslateSettings = (
  projectId: string,
  settings: TranslateSettings,
): Promise<void> => setJsonMeta(`translateSettings_${projectId}`, settings)

// --- Vanilla translation memory (per game) ---

const memoryId = (game: GameId, text: string): string => `${game}\u0000${text}`

export async function replaceVanillaMemory(game: GameId, pairs: Map<string, string>): Promise<void> {
  const rows = Array.from(pairs, ([text, translation]) => ({ id: memoryId(game, text), game, text, translation }))
  await db.transaction('rw', db.gameMemory, async () => {
    await db.gameMemory.where('game').equals(game).delete()
    await db.gameMemory.bulkPut(rows)
  })
}

export async function getVanillaMemory(game: GameId): Promise<Map<string, string>> {
  const rows = await db.gameMemory.where('game').equals(game).toArray()
  return new Map(rows.map((r) => [r.text, r.translation]))
}

export async function getVanillaMemoryCount(game: GameId): Promise<number> {
  return db.gameMemory.where('game').equals(game).count()
}

// --- Bulk translation price inputs (per 1M tokens, free-form text as typed) ---

export interface BulkPrices {
  input: string
  output: string
}

export const getBulkPrices = (): Promise<BulkPrices | null> => getJsonMeta<BulkPrices>('bulkPrices')

export const setBulkPrices = (prices: BulkPrices): Promise<void> => setJsonMeta('bulkPrices', prices)
