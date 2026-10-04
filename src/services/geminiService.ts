import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { ThinkingSetting, TranslationEntry } from '@/types'
import { getGameProfile } from '@/games'
import { splitValid } from '@/services/translationPrep'
import { translateWithRetry } from '@/services/geminiError'
import {
  buildChunkPrompt,
  formatChunk,
  parseGlossarySuggestions,
  parseResponse,
  prepareRun,
} from '@/services/chunking'
import {
  DEFAULT_TRANSLATE_SETTINGS,
  type TranslateOptions,
  type TranslateProgress,
  type TranslateResult,
  type TranslationChunk,
} from '@/services/translateTypes'

const THINKING_LEVELS: Record<Exclude<ThinkingSetting, 'default'>, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}

const MAX_MISSING_RETRIES = 2

export async function autoTranslateFile(
  entries: TranslationEntry[],
  apiKey: string,
  model: string,
  systemPrompt: string,
  fileName: string,
  onProgress: (progress: TranslateProgress) => void,
  onChunkDone: (updates: Map<string, string>) => void,
  signal?: AbortSignal,
  options: TranslateOptions = {},
): Promise<TranslateResult> {
  const { instant, chunks, expand } = prepareRun(entries, options)
  const failedKeys: string[] = []
  let translatedCount = 0

  if (instant.size > 0) {
    translatedCount += instant.size
    onChunkDone(instant)
  }
  if (chunks.length === 0) return { total: translatedCount, failedKeys }

  const ai = new GoogleGenAI({ apiKey })
  const game = options.game ?? getGameProfile()
  const thinking = options.thinking ?? DEFAULT_TRANSLATE_SETTINGS.thinking
  let completed = 0

  const emit = (extra?: Partial<TranslateProgress>): void =>
    onProgress({
      currentChunk: Math.min(completed + 1, chunks.length),
      totalChunks: chunks.length,
      translatedCount,
      ...extra,
    })

  async function processChunk(chunk: TranslationChunk): Promise<void> {
    const prompt = buildChunkPrompt(systemPrompt, options.glossary, chunk)
    const updates = new Map<string, string>()
    let pending = chunk.entries
    let invalidKeys: string[] = []

    // The model sometimes skips lines, mangles $VAR$/§ codes or gets cut off;
    // re-ask for just those keys.
    for (let attempt = 0; attempt <= MAX_MISSING_RETRIES && pending.length > 0; attempt++) {
      if (signal?.aborted) return
      const yml = formatChunk({ entries: pending, context: chunk.context })
      const note =
        invalidKeys.length > 0
          ? `\n\nВНИМАНИЕ: в прошлой попытке были потеряны или изменены переменные и коды в строках: ${invalidKeys.join(', ')}. Сохрани все фрагменты (${game.tokenHint}) точно как в оригинале.`
          : ''

      const fullText = await translateWithRetry(
        async () => {
          let text = ''
          const stream = await ai.models.generateContentStream({
            model,
            config: {
              ...(options.temperature != null ? { temperature: options.temperature } : {}),
              ...(thinking !== 'default'
                ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[thinking] } }
                : {}),
              systemInstruction: [{ text: prompt }],
            },
            contents: [{ role: 'user', parts: [{ text: `Файл: ${fileName}\n\n${yml}${note}` }] }],
          })
          for await (const part of stream) {
            if (signal?.aborted) break
            if (part.text) {
              text += part.text
              emit({ streamingText: text })
            }
          }
          return text
        },
        (retrying) => emit({ retrying }),
        signal,
      )

      if (signal?.aborted) return

      const got = parseResponse(fullText, new Set(pending.map((e) => e.key)))
      const { valid, invalidKeys: bad } = splitValid(pending, got, game)
      for (const [k, v] of valid) updates.set(k, v)
      pending = pending.filter((e) => !valid.has(e.key))
      invalidKeys = bad

      const suggestions = parseGlossarySuggestions(fullText)
      if (suggestions.length > 0) options.onGlossarySuggestions?.(suggestions)
    }

    for (const e of pending) failedKeys.push(e.key)
    if (signal?.aborted) return

    const expanded = expand(updates)
    translatedCount += expanded.size
    completed++
    onChunkDone(expanded)
    emit()
  }

  // Worker pool: `concurrency` chunks in flight; first failure stops the rest.
  let next = 0
  let failure: unknown = null
  const worker = async (): Promise<void> => {
    while (failure === null && !signal?.aborted) {
      const i = next++
      if (i >= chunks.length) return
      try {
        await processChunk(chunks[i])
      } catch (err) {
        failure = failure ?? err
        return
      }
    }
  }
  emit()
  const workers = Math.max(1, Math.min(options.concurrency ?? DEFAULT_TRANSLATE_SETTINGS.concurrency, chunks.length))
  await Promise.all(Array.from({ length: workers }, worker))
  if (failure !== null && !signal?.aborted) throw failure

  return { total: translatedCount, failedKeys }
}
