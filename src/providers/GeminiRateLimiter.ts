export const FREE_MODEL = 'gemini-2.5-flash'
// Informational constants — actual limits are enforced reactively via 429 responses
export const FREE_RPM = 15
export const FREE_RPD = 200

// ─── Error types ──────────────────────────────────────────────────────────────

export class DailyLimitExhaustedError extends Error {
  constructor() {
    super('Дневной лимит запросов исчерпан')
    this.name = 'DailyLimitExhaustedError'
  }
}

// Backward-compat alias
export { DailyLimitExhaustedError as DailyLimitError }

export class UnexpectedRateLimitError extends Error {
  constructor() {
    super('Неожиданный rate limit: превышено максимальное число попыток на один блок')
    this.name = 'UnexpectedRateLimitError'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeminiErrorDetail {
  '@type': string
  retryDelay?: string // e.g. "30s" — only present on RPM errors
}

export type RateLimitDecision =
  | { action: 'retry'; waitSeconds: number }
  | { action: 'abort'; reason: 'daily_limit' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRetryDelay(details: GeminiErrorDetail[]): number | null {
  for (const d of details) {
    if (d.retryDelay) {
      const m = d.retryDelay.match(/^(\d+)s$/)
      if (m) return parseInt(m[1], 10)
    }
  }
  return null
}

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

// ─── GeminiRateLimiter ────────────────────────────────────────────────────────

export class GeminiRateLimiter {
  /**
   * Parses 429 error details and decides what to do next.
   *
   * RPM (temporary):  retryDelay present and ≤ 120s → { action: 'retry', waitSeconds }
   * RPD (daily limit): no retryDelay or > 120s      → { action: 'abort', reason: 'daily_limit' }
   */
  handle429(details: unknown[]): RateLimitDecision {
    const typed = details as GeminiErrorDetail[]
    const retryDelay = parseRetryDelay(typed)
    if (retryDelay !== null && retryDelay <= 120) {
      return { action: 'retry', waitSeconds: retryDelay }
    }
    return { action: 'abort', reason: 'daily_limit' }
  }

  /**
   * Counts down (waitSeconds + 2s buffer), calling onWait each second with seconds remaining.
   * Throws AbortError if signal fires.
   */
  async wait(
    waitSeconds: number,
    onWait?: (secondsLeft: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const total = waitSeconds + 2
    for (let left = total; left > 0; left--) {
      if (signal?.aborted) throw new DOMException('', 'AbortError')
      onWait?.(left)
      await sleep(1000, signal)
    }
  }
}
