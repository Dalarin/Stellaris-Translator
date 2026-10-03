import { db } from './schema'
import { LEGACY_DEFAULT_SYSTEM_PROMPTS, DEFAULT_TRANSLATE_SETTINGS } from '@/services/geminiService'
import type { Project, TranslationFile, GlossaryEntry, TranslateSettings } from '@/types'

// --- Projects ---

export async function getProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function createProject(name: string, id: string): Promise<Project> {
  const now = new Date()
  const project: Project = { id, name, createdAt: now, updatedAt: now }
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

// --- Meta ---

export async function getLastProjectId(): Promise<string | null> {
  const record = await db.meta.get('lastProjectId')
  return record?.value ?? null
}

export async function setLastProjectId(id: string): Promise<void> {
  await db.meta.put({ key: 'lastProjectId', value: id })
}

// --- Gemini settings ---

export interface GeminiSettings {
  apiKey: string
  model: string
  /** @deprecated use freeApiKeys */
  freeApiKey?: string
  freeApiKeys: string[]
}

export async function getGeminiSettings(): Promise<GeminiSettings | null> {
  const record = await db.meta.get('geminiSettings')
  if (!record) return null
  try {
    const raw = JSON.parse(record.value) as Omit<GeminiSettings, 'freeApiKeys'> & { freeApiKeys?: string[] }
    // Migrate legacy single-key field
    const freeApiKeys = raw.freeApiKeys?.length
      ? raw.freeApiKeys
      : raw.freeApiKey
        ? [raw.freeApiKey]
        : []
    return { ...raw, freeApiKeys }
  } catch {
    return null
  }
}

export async function setGeminiSettings(apiKey: string, model: string): Promise<void> {
  const existing = await getGeminiSettings()
  await db.meta.put({
    key: 'geminiSettings',
    value: JSON.stringify({ apiKey, model, freeApiKeys: existing?.freeApiKeys ?? [] }),
  })
}

export async function setFreeApiKeys(freeApiKeys: string[]): Promise<void> {
  const existing = await getGeminiSettings()
  await db.meta.put({
    key: 'geminiSettings',
    value: JSON.stringify({ apiKey: existing?.apiKey ?? '', model: existing?.model ?? '', freeApiKeys }),
  })
}

// --- Per-project Gemini system prompt ---

export async function getProjectGeminiPrompt(projectId: string): Promise<string | null> {
  const record = await db.meta.get(`geminiPrompt_${projectId}`)
  if (!record) return null
  // Untouched old default → fall back to the current default prompt
  if (LEGACY_DEFAULT_SYSTEM_PROMPTS.includes(record.value)) return null
  return record.value
}

export async function setProjectGeminiPrompt(projectId: string, prompt: string): Promise<void> {
  await db.meta.put({ key: `geminiPrompt_${projectId}`, value: prompt })
}

// --- Per-project translation settings (chunk size, thinking, temperature, concurrency) ---

export async function getProjectTranslateSettings(projectId: string): Promise<TranslateSettings> {
  const record = await db.meta.get(`translateSettings_${projectId}`)
  let stored: Partial<TranslateSettings> = {}
  if (record) {
    try { stored = JSON.parse(record.value) as Partial<TranslateSettings> } catch { /* use defaults */ }
  } else {
    // Settings saved before translateSettings existed only had the chunk size
    const legacy = await db.meta.get(`chunkChars_${projectId}`)
    const n = legacy ? parseInt(legacy.value, 10) : NaN
    if (Number.isFinite(n) && n > 0) stored = { chunkChars: n }
  }
  return { ...DEFAULT_TRANSLATE_SETTINGS, ...stored }
}

export async function setProjectTranslateSettings(
  projectId: string,
  settings: TranslateSettings,
): Promise<void> {
  await db.meta.put({ key: `translateSettings_${projectId}`, value: JSON.stringify(settings) })
}

// --- Vanilla translation memory ---

export async function replaceVanillaMemory(pairs: Map<string, string>): Promise<void> {
  const rows = Array.from(pairs, ([text, translation]) => ({ text, translation }))
  await db.transaction('rw', db.vanillaMemory, async () => {
    await db.vanillaMemory.clear()
    await db.vanillaMemory.bulkPut(rows)
  })
}

export async function getVanillaMemory(): Promise<Map<string, string>> {
  const rows = await db.vanillaMemory.toArray()
  return new Map(rows.map((r) => [r.text, r.translation]))
}

export async function getVanillaMemoryCount(): Promise<number> {
  return db.vanillaMemory.count()
}

// --- Bulk translation price inputs (per 1M tokens, free-form text as typed) ---

export async function getBulkPrices(): Promise<{ input: string; output: string } | null> {
  const record = await db.meta.get('bulkPrices')
  if (!record) return null
  try { return JSON.parse(record.value) as { input: string; output: string } } catch { return null }
}

export async function setBulkPrices(prices: { input: string; output: string }): Promise<void> {
  await db.meta.put({ key: 'bulkPrices', value: JSON.stringify(prices) })
}
