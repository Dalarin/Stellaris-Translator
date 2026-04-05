import { GoogleGenAI } from '@google/genai'
import { GeminiRateLimiter, DailyLimitExhaustedError, UnexpectedRateLimitError, FREE_MODEL } from '@/providers/GeminiRateLimiter'
import { ApiKeyPool } from '@/providers/ApiKeyPool'
import { GeminiError } from '@/services/geminiService'
import { buildChunks, formatChunk, parseResponse } from '@/services/geminiService'
import type { TranslationEntry } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FreeTranslateProgress =
  | { type: 'translating'; current: number; total: number; translatedCount: number }
  | { type: 'rpm_wait'; secondsLeft: number; current: number; total: number }

export interface FreeTranslateResult {
  total: number
  isComplete: boolean
  processedChunks: number
  totalChunks: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NETWORK_RETRY_DELAYS_MS = [1000, 2000, 4000]
/** Max number of full key-rotation rounds before giving up on RPM waits */
const MAX_RPM_WAIT_ROUNDS = 3

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => { clearTimeout(t); reject(new DOMException('', 'AbortError')) },
      { once: true },
    )
  })
}

/**
 * Retries fn on retryable non-429 errors with exponential backoff.
 * 429 errors are passed through immediately — they're handled by the RPM/RPD loop.
 */
async function callWithNetworkRetry(
  fn: () => Promise<string>,
  signal?: AbortSignal,
): Promise<string> {
  for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (signal?.aborted) throw err
      const e = GeminiError.from(err)
      if (e.code === 429) throw e // handled by outer loop
      const isLast = attempt >= NETWORK_RETRY_DELAYS_MS.length
      if (!e.isRetryable || isLast) throw e
      await sleep(NETWORK_RETRY_DELAYS_MS[attempt], signal)
    }
  }
  throw new GeminiError('Превышено число попыток', 0, '')
}

// ─── Validate key ─────────────────────────────────────────────────────────────

export async function validateFreeApiKey(apiKey: string): Promise<boolean> {
  try {
    const ai = new GoogleGenAI({ apiKey })
    await ai.models.generateContent({
      model: FREE_MODEL,
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    })
    return true
  } catch {
    return false
  }
}

// ─── Main translation function ────────────────────────────────────────────────

export async function autoTranslateFree(
  entries: TranslationEntry[],
  freeApiKeys: string[],
  systemPrompt: string,
  fileName: string,
  onProgress: (p: FreeTranslateProgress) => void,
  onChunkDone: (updates: Map<string, string>) => void,
  signal?: AbortSignal,
): Promise<FreeTranslateResult> {
  const pool = new ApiKeyPool(freeApiKeys)
  const limiter = new GeminiRateLimiter()
  const chunks = buildChunks(entries)

  if (chunks.length === 0) {
    return { total: 0, isComplete: true, processedChunks: 0, totalChunks: 0 }
  }

  const knownKeys = new Set(entries.map((e) => e.key))
  let translatedCount = 0

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) break

    onProgress({ type: 'translating', current: i + 1, total: chunks.length, translatedCount })

    const yml = formatChunk(chunks[i])

    // Per-chunk rate-limit state
    const triedInRound = new Set<number>()  // keys tried with RPM error this round
    let rpmWaitRounds = 0
    let text = ''

    while (true) {
      if (signal?.aborted) throw new DOMException('', 'AbortError')

      try {
        // Capture key value at call time so network retries use the same key
        const key = pool.currentKey
        text = await callWithNetworkRetry(async () => {
          const ai = new GoogleGenAI({ apiKey: key })
          const response = await ai.models.generateContent({
            model: FREE_MODEL,
            config: {
              temperature: 0.4,
              systemInstruction: [{ text: systemPrompt }],
            },
            contents: [{ role: 'user', parts: [{ text: `Файл: ${fileName}\n\n${yml}` }] }],
          })
          return response.text ?? ''
        }, signal)
        break // success
      } catch (err) {
        if (signal?.aborted) throw err

        const e = GeminiError.from(err)
        if (e.code !== 429) throw e

        const decision = limiter.handle429(e.details)

        if (decision.action === 'abort') {
          // RPD exhausted on this key — remove it and try the next
          const hasMore = pool.exhaustCurrent()
          if (!hasMore) {
            return { total: translatedCount, isComplete: false, processedChunks: i, totalChunks: chunks.length }
          }
          // New key available; clear RPM tracking since it's a fresh key
          triedInRound.delete(pool.currentIndex)
        } else {
          // RPM throttle — mark this key tried, rotate to next
          triedInRound.add(pool.currentIndex)
          pool.rotateNext()

          if (!triedInRound.has(pool.currentIndex)) {
            // This key hasn't been tried yet this round — retry immediately
            onProgress({ type: 'translating', current: i + 1, total: chunks.length, translatedCount })
            continue
          }

          // All available keys hit RPM this round — need to wait
          rpmWaitRounds++
          if (rpmWaitRounds > MAX_RPM_WAIT_ROUNDS) {
            throw new UnexpectedRateLimitError()
          }

          await limiter.wait(
            decision.waitSeconds,
            (secsLeft) => onProgress({ type: 'rpm_wait', secondsLeft: secsLeft, current: i + 1, total: chunks.length }),
            signal,
          )
          triedInRound.clear()
          onProgress({ type: 'translating', current: i + 1, total: chunks.length, translatedCount })
        }
      }
    }

    const updates = parseResponse(text, knownKeys)
    translatedCount += updates.size
    onChunkDone(updates)
  }

  const isComplete = !signal?.aborted
  return { total: translatedCount, isComplete, processedChunks: chunks.length, totalChunks: chunks.length }
}

export { DailyLimitExhaustedError, UnexpectedRateLimitError }
