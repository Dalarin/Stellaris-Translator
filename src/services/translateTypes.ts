import type { GameProfile } from '@/games'
import type { TranslateSettings, TranslationEntry, ThinkingSetting } from '@/types'
import type { RetryState } from '@/services/geminiError'

export const DEFAULT_CHUNK_CHARS = 12000
export const DEFAULT_TRANSLATE_SETTINGS: TranslateSettings = {
  chunkChars: DEFAULT_CHUNK_CHARS,
  thinking: 'medium',
  temperature: null,
  concurrency: 3,
}

export interface TranslationChunk {
  entries: TranslationEntry[]
  context: TranslationEntry[]
}

export interface GlossarySuggestion {
  sourceTerm: string
  targetTerm: string
}

export interface GlossaryTerm {
  sourceTerm: string
  targetTerm: string
}

export interface TranslateProgress {
  currentChunk: number
  totalChunks: number
  translatedCount: number
  streamingText?: string
  retrying?: RetryState
}

export interface TranslateOptions {
  /** Game being translated; omitted means Stellaris */
  game?: GameProfile
  maxChunkChars?: number
  glossary?: readonly GlossaryTerm[]
  /** exact English text → known translation (see buildTranslationMemory) */
  memory?: Map<string, string>
  thinking?: ThinkingSetting
  /** null/undefined = model default */
  temperature?: number | null
  /** parallel requests */
  concurrency?: number
  onGlossarySuggestions?: (suggestions: GlossarySuggestion[]) => void
}

export interface TranslateResult {
  total: number
  /** Keys left untranslated: skipped by the model or lost game tokens ($VAR$, §Y, [..]) after retries */
  failedKeys: string[]
}
