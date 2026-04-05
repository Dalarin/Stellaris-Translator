import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { TranslationEntry } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHUNK_CHARS = 6000
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('', 'AbortError')) }, { once: true })
  })
}

async function translateWithRetry(
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

// ─── Prompt / chunk helpers ───────────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT = `Ты — эксперт по локализации игр. Переводи текст локализации Stellaris с английского на русский язык.

Строгие правила:
- Выдавай ТОЛЬКО переведённые строки в формате Stellaris YML, начиная с "l_russian:"
- Сохраняй ключи и индексы без изменений (например, KEY_NAME:0)
- Сохраняй все цветовые коды как есть: §Y §! §R §B §G §W §H §C и другие
- Сохраняй \\n внутри строк
- Сохраняй переменные и иконки: [This.GetName], $VAR$, %SEQ%, £icon£, @icon@ и другие
- Никаких комментариев, объяснений, markdown или лишнего текста`

function entryLine(e: TranslationEntry): string {
  const indexPart =
    e.index !== null && e.index !== undefined && !isNaN(e.index) ? `:${e.index}` : ''
  return ` ${e.key}${indexPart} "${e.originalText}"\n`
}

export function buildChunks(entries: TranslationEntry[]): TranslationEntry[][] {
  const untranslated = entries.filter(
    (e) => e.status !== 'translated' && e.status !== 'approved',
  )
  const chunks: TranslationEntry[][] = []
  let current: TranslationEntry[] = []
  let currentChars = 'l_english:\n'.length

  for (const entry of untranslated) {
    const cost = entryLine(entry).length
    if (current.length > 0 && currentChars + cost > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = [entry]
      currentChars = 'l_english:\n'.length + cost
    } else {
      current.push(entry)
      currentChars += cost
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export function formatChunk(entries: TranslationEntry[]): string {
  const lines = ['l_english:\n']
  for (const e of entries) lines.push(entryLine(e))
  return lines.join('')
}

export function parseResponse(response: string, knownKeys: Set<string>): Map<string, string> {
  const result = new Map<string, string>()
  const lineRe = /^\s+([\w.:@\-]+)(?::(\d+))?\s+"(.*)"\s*$/
  for (const line of response.split('\n')) {
    const m = line.match(lineRe)
    if (!m) continue
    const [, key, , text] = m
    if (knownKeys.has(key)) result.set(key, text)
  }
  return result
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TranslateProgress {
  currentChunk: number
  totalChunks: number
  translatedCount: number
  streamingText?: string
  retrying?: RetryState
}

export async function autoTranslateFile(
  entries: TranslationEntry[],
  apiKey: string,
  model: string,
  systemPrompt: string,
  fileName: string,
  onProgress: (progress: TranslateProgress) => void,
  onChunkDone: (updates: Map<string, string>) => void,
  signal?: AbortSignal,
): Promise<{ total: number }> {
  const chunks = buildChunks(entries)
  if (chunks.length === 0) return { total: 0 }

  const knownKeys = new Set(entries.map((e) => e.key))
  let translatedCount = 0
  const ai = new GoogleGenAI({ apiKey })

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) break

    const base: Omit<TranslateProgress, 'streamingText' | 'retrying'> = {
      currentChunk: i + 1,
      totalChunks: chunks.length,
      translatedCount,
    }
    onProgress(base)

    const yml = formatChunk(chunks[i])
    let fullText = ''

    fullText = await translateWithRetry(
      async () => {
        let text = ''
        const stream = await ai.models.generateContentStream({
          model,
          config: {
            temperature: 0.4,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            systemInstruction: [{ text: systemPrompt }],
          },
          contents: [{ role: 'user', parts: [{ text: `Файл: ${fileName}\n\n${yml}` }] }],
        })
        for await (const chunk of stream) {
          if (signal?.aborted) break
          if (chunk.text) {
            text += chunk.text
            onProgress({ ...base, streamingText: text })
          }
        }
        return text
      },
      (retrying) => onProgress({ ...base, retrying }),
      signal,
    )

    if (signal?.aborted) break

    const updates = parseResponse(fullText, knownKeys)
    translatedCount += updates.size
    onChunkDone(updates)
    onProgress({ ...base, translatedCount })
  }

  return { total: translatedCount }
}
