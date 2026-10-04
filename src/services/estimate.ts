import { buildChunkPrompt, formatChunk, prepareRun } from '@/services/chunking'
import { type TranslateOptions } from '@/services/translateTypes'
import type { TranslationEntry } from '@/types'

// Rough tokenizer ratios — good for planning, not for billing.
const CHARS_PER_TOKEN_INPUT = 3
const CHARS_PER_TOKEN_OUTPUT = 2.4
/** Russian text is a bit longer than the English source */
const OUTPUT_GROWTH = 1.15

export interface RunEstimate {
  /** Strings that need the model */
  entriesToTranslate: number
  /** Filled without a request (trivial strings, memory hits, duplicates) */
  entriesFree: number
  requests: number
  inputTokens: number
  /** Output tokens without thinking — thinking tokens are billed as output on top of this */
  outputTokens: number
}

export function estimateRun(
  entries: TranslationEntry[],
  basePrompt: string,
  options: TranslateOptions,
): RunEstimate {
  const { instant, chunks } = prepareRun(entries, options)
  const dupes = entries.filter((e) => e.status !== 'translated' && e.status !== 'approved').length
    - instant.size
    - chunks.reduce((n, c) => n + c.entries.length, 0)

  let inputChars = 0
  let outputChars = 0
  let toTranslate = 0
  for (const chunk of chunks) {
    inputChars += buildChunkPrompt(basePrompt, options.glossary, chunk).length + formatChunk(chunk).length
    for (const e of chunk.entries) outputChars += (e.originalText.length + e.key.length + 8) * OUTPUT_GROWTH
    toTranslate += chunk.entries.length
  }

  return {
    entriesToTranslate: toTranslate,
    entriesFree: instant.size + Math.max(0, dupes),
    requests: chunks.length,
    inputTokens: Math.round(inputChars / CHARS_PER_TOKEN_INPUT),
    outputTokens: Math.round(outputChars / CHARS_PER_TOKEN_OUTPUT),
  }
}

export function sumEstimates(list: RunEstimate[]): RunEstimate {
  return list.reduce(
    (a, b) => ({
      entriesToTranslate: a.entriesToTranslate + b.entriesToTranslate,
      entriesFree: a.entriesFree + b.entriesFree,
      requests: a.requests + b.requests,
      inputTokens: a.inputTokens + b.inputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
    }),
    { entriesToTranslate: 0, entriesFree: 0, requests: 0, inputTokens: 0, outputTokens: 0 },
  )
}

/** Price per 1M tokens in the user's currency. */
export function estimateCost(e: RunEstimate, inputPer1M: number, outputPer1M: number): number {
  return (e.inputTokens / 1e6) * inputPer1M + (e.outputTokens / 1e6) * outputPer1M
}
