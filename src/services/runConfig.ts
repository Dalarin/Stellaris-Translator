import { getProjectGeminiPrompt, getProjectTranslateSettings, getVanillaMemory } from '@/db/operations'
import { DEFAULT_SYSTEM_PROMPT, type GlossarySuggestion, type TranslateOptions } from '@/services/geminiService'
import { buildTranslationMemory } from '@/services/translationPrep'
import type { GlossaryEntry, TranslationFile } from '@/types'

export interface RunConfig {
  basePrompt: string
  options: TranslateOptions
  vanilla: Map<string, string>
}

/** Translation memory: project translations first, official vanilla ones for the rest. */
export function mergeMemory(
  projectFiles: TranslationFile[],
  vanilla: Map<string, string>,
): Map<string, string> {
  const memory = buildTranslationMemory(projectFiles)
  for (const [text, translation] of vanilla) if (!memory.has(text)) memory.set(text, translation)
  return memory
}

/** Everything a Gemini run needs besides the entries: prompt, project settings, glossary, memory. */
export async function loadRunConfig(
  projectId: string,
  projectFiles: TranslationFile[],
  glossary: readonly GlossaryEntry[],
  onGlossarySuggestions?: (suggestions: GlossarySuggestion[]) => void,
): Promise<RunConfig> {
  const [savedPrompt, tSettings, vanilla] = await Promise.all([
    getProjectGeminiPrompt(projectId),
    getProjectTranslateSettings(projectId),
    getVanillaMemory(),
  ])
  return {
    basePrompt: savedPrompt ?? DEFAULT_SYSTEM_PROMPT,
    vanilla,
    options: {
      maxChunkChars: tSettings.chunkChars,
      thinking: tSettings.thinking,
      temperature: tSettings.temperature,
      concurrency: tSettings.concurrency,
      glossary: glossary.filter((e) => !e.status || e.status === 'accepted'),
      memory: mergeMemory(projectFiles, vanilla),
      onGlossarySuggestions,
    },
  }
}
