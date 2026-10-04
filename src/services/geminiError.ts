import { sleep } from '@/utils/async'

const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504])
export const RETRY_DELAYS_S = [3, 7, 15] // seconds before each retry attempt

// ─── GeminiError ─────────────────────────────────────────────────────────────

export class GeminiError extends Error {
  readonly code: number
  readonly status: string
  readonly details: unknown[]

  constructor(message: string, code: number, status: string, details: unknown[] = []) {
    super(message)
    this.name = 'GeminiError'
    this.code = code
    this.status = status
    this.details = details
  }

  get isRetryable(): boolean {
    return RETRYABLE_CODES.has(this.code)
  }

  get userMessage(): string {
    switch (this.code) {
      case 429: return 'Превышен лимит запросов к API'
      case 500: return 'Внутренняя ошибка сервера Gemini'
      case 503: return 'Модель перегружена — попробуйте позже'
      case 400: return `Неверный запрос: ${this.message}`
      case 401:
      case 403: return 'Ошибка авторизации — проверьте API ключ'
      default:  return this.message || `Ошибка ${this.code}`
    }
  }

  /**
   * SDK оборачивает тело HTTP-ответа как JSON-строку внутри err.message.
   * Разворачиваем цепочку вложений, чтобы добраться до настоящего сообщения.
   */
  static from(err: unknown): GeminiError {
    if (err instanceof GeminiError) return err

    if (err instanceof Error) {
      try {
        const outer = JSON.parse(err.message) as {
          error?: { message?: string; code?: number; status?: string; details?: unknown[] }
        }
        if (outer?.error) {
          const { message: msg = '', code = 0, status = '', details = [] } = outer.error
          // Сообщение может снова содержать вложенный JSON
          try {
            const inner = JSON.parse(msg) as {
              error?: { message?: string; code?: number; status?: string; details?: unknown[] }
            }
            if (inner?.error?.message) {
              return new GeminiError(
                inner.error.message,
                inner.error.code ?? code,
                inner.error.status ?? status,
                inner.error.details ?? details,
              )
            }
          } catch { /* не JSON */ }
          return new GeminiError(msg, code, status, details)
        }
      } catch { /* не JSON */ }
      return new GeminiError(err.message, 0, '', [])
    }

    return new GeminiError(String(err), 0, '', [])
  }
}

// ─── Retry ────────────────────────────────────────────────────────────────────

export interface RetryState {
  attempt: number
  maxAttempts: number
  waitSecondsLeft: number
}

export async function translateWithRetry(
  fn: () => Promise<string>,
  onRetryState: (state: RetryState) => void,
  signal?: AbortSignal,
): Promise<string> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_S.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (signal?.aborted) throw err

      const geminiErr = GeminiError.from(err)
      const isLastAttempt = attempt >= RETRY_DELAYS_S.length

      if (!geminiErr.isRetryable || isLastAttempt) throw geminiErr

      const totalSeconds = RETRY_DELAYS_S[attempt]
      for (let left = totalSeconds; left > 0; left--) {
        if (signal?.aborted) throw geminiErr
        onRetryState({ attempt: attempt + 1, maxAttempts: RETRY_DELAYS_S.length, waitSecondsLeft: left })
        await sleep(1000, signal)
      }
    }
  }
  throw new GeminiError('Превышено число попыток', 0, '')
}
