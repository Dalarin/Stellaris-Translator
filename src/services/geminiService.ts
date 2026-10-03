import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { TranslationEntry, TranslateSettings, ThinkingSetting } from '@/types'
import {
  escapeQuotes,
  unescapeQuotes,
  planWork,
  splitValid,
} from '@/services/translationPrep'

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_CHUNK_CHARS = 12000
export const DEFAULT_TRANSLATE_SETTINGS: TranslateSettings = {
  chunkChars: DEFAULT_CHUNK_CHARS,
  thinking: 'medium',
  temperature: null,
  concurrency: 3,
}

const THINKING_LEVELS: Record<Exclude<ThinkingSetting, 'default'>, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}
/** Max chars of already-translated neighbour entries sent as read-only context */
const MAX_CONTEXT_CHARS = 3000
const CONTEXT_NEIGHBOURS = 2
const MAX_MISSING_RETRIES = 2
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

export const DEFAULT_SYSTEM_PROMPT = `Ты — опытный литературный переводчик и локализатор игр. Переводи текст локализации Stellaris с английского на русский язык.

Стиль:
- Звучит как оригинальный русский текст, а не как калька. Избегай канцелярита и дословности.
- Описания ивентов (ключи с .desc / _desc) — это маленькие истории: пиши образно и атмосферно, с живыми эпитетами, ритмом и настроением научной фантастики; передавай тон сцены (тревога, величие, ирония, ужас, надежда). Не обрезай и не выдумывай факты, но разрешено перестраивать фразы ради выразительности.
- Названия ивентов (.name) — ёмкие и запоминающиеся.
- Кнопки выбора (.a / .b / .c и подобные) — коротко и по делу, в духе решения персонажа.
- Тултипы, описания эффектов и модификаторов — точно и буквально, без художественных вольностей: игроку важна механика.
- Выдерживай единый стиль и терминологию по всему файлу.

Строгие правила:
- Выдавай ТОЛЬКО переведённые строки в формате Stellaris YML, начиная с "l_russian:"
- Сохраняй ключи и индексы без изменений (например, KEY_NAME:0)
- Сохраняй все цветовые коды как есть: §Y §! §R §B §G §W §H §C и другие
- Сохраняй \\n внутри строк
- Сохраняй переменные и иконки: [This.GetName], $VAR$, %SEQ%, £icon£, @icon@ и другие
- Никаких комментариев, объяснений, markdown или лишнего текста`

/** Previous built-in default; projects that saved it unchanged are upgraded to the new default. */
export const LEGACY_DEFAULT_SYSTEM_PROMPTS = [
  `Ты — эксперт по локализации игр. Переводи текст локализации Stellaris с английского на русский язык.

Строгие правила:
- Выдавай ТОЛЬКО переведённые строки в формате Stellaris YML, начиная с "l_russian:"
- Сохраняй ключи и индексы без изменений (например, KEY_NAME:0)
- Сохраняй все цветовые коды как есть: §Y §! §R §B §G §W §H §C и другие
- Сохраняй \\n внутри строк
- Сохраняй переменные и иконки: [This.GetName], $VAR$, %SEQ%, £icon£, @icon@ и другие
- Никаких комментариев, объяснений, markdown или лишнего текста`,
]

/**
 * Protocol part of the prompt. Always appended by the services (not user-editable),
 * so custom/old project prompts keep working with context, updates and glossary suggestions.
 */
const PROTOCOL_ADDENDUM = `

Формат запроса:
- Секция "# КОНТЕКСТ" содержит уже переведённые соседние строки (EN => RU). Используй их только для понимания сюжета, тона и терминологии. НЕ переводи их и НЕ включай в ответ.
- Секция "# ПЕРЕВЕСТИ" — строки, которые нужно перевести.
- Если перед строкой есть комментарии "# ОБНОВЛЕНО", английский текст изменился после того, как был сделан перевод. В них указаны прежний EN и прежний RU. Сохрани удачные формулировки и стиль прежнего перевода, измени только то, что изменилось по смыслу.

Новые термины:
- После всех переведённых строк можешь добавить строки вида "#GLOSSARY English term => русский перевод" для устойчивых имён собственных, названий фракций, технологий, существ и мест, которые встретились в этом фрагменте и которым нужен единый перевод. Не добавляй обычные слова и термины, уже имеющиеся в глоссарии. Не более 15 строк.`

export interface TranslationChunk {
  entries: TranslationEntry[]
  context: TranslationEntry[]
}

export interface GlossarySuggestion {
  sourceTerm: string
  targetTerm: string
}

function isDone(e: TranslationEntry): boolean {
  return (e.status === 'translated' || e.status === 'approved') && e.translatedText !== ''
}

function keyIndexPart(e: TranslationEntry): string {
  return e.index !== null && e.index !== undefined && !isNaN(e.index) ? `:${e.index}` : ''
}

function entryLine(e: TranslationEntry): string {
  let prefix = ''
  if (e.status === 'outdated' && e.translatedText) {
    if (e.previousOriginalText) {
      prefix += ` # ОБНОВЛЕНО. Прежний EN: "${escapeQuotes(e.previousOriginalText)}"\n`
    }
    prefix += ` # ОБНОВЛЕНО. Прежний RU: "${escapeQuotes(e.translatedText)}"\n`
  }
  return `${prefix} ${e.key}${keyIndexPart(e)} "${escapeQuotes(e.originalText)}"\n`
}

function contextLine(e: TranslationEntry): string {
  return ` ${e.key}${keyIndexPart(e)} "${escapeQuotes(e.originalText)}" => "${escapeQuotes(e.translatedText)}"\n`
}

/** Key without its last segment, e.g. "my_event.12.desc" → "my_event.12". */
function keyGroup(key: string): string {
  const i = key.lastIndexOf('.')
  return i > 0 ? key.slice(0, i) : key
}

/**
 * Picks already-translated entries around the chunk: file neighbours plus entries of
 * the same event/group (shared key prefix). Keeps the model consistent when only a few
 * lines of a file changed.
 */
function buildContext(chunk: TranslationEntry[], all: TranslationEntry[]): TranslationEntry[] {
  const inChunk = new Set(chunk.map((e) => e.key))
  const positions = new Map(all.map((e, i) => [e.key, i]))
  const picked = new Map<string, TranslationEntry>()
  let chars = 0

  const tryAdd = (e: TranslationEntry | undefined): void => {
    if (!e || inChunk.has(e.key) || picked.has(e.key) || !isDone(e)) return
    const cost = contextLine(e).length
    if (chars + cost > MAX_CONTEXT_CHARS) return
    picked.set(e.key, e)
    chars += cost
  }

  for (const e of chunk) {
    const pos = positions.get(e.key)
    if (pos === undefined) continue
    for (let d = 1; d <= CONTEXT_NEIGHBOURS; d++) {
      tryAdd(all[pos - d])
      tryAdd(all[pos + d])
    }
  }

  const groups = new Set(chunk.map((e) => keyGroup(e.key)))
  for (const e of all) {
    if (groups.has(keyGroup(e.key))) tryAdd(e)
  }

  return all.filter((e) => picked.has(e.key))
}

export function buildChunks(
  entries: TranslationEntry[],
  maxChunkChars: number = DEFAULT_CHUNK_CHARS,
  skipKeys?: ReadonlySet<string>,
): TranslationChunk[] {
  const untranslated = entries.filter(
    (e) => e.status !== 'translated' && e.status !== 'approved' && !skipKeys?.has(e.key),
  )
  const groups: TranslationEntry[][] = []
  let current: TranslationEntry[] = []
  let currentChars = 'l_english:\n'.length

  for (const entry of untranslated) {
    const cost = entryLine(entry).length
    if (current.length > 0 && currentChars + cost > maxChunkChars) {
      groups.push(current)
      current = [entry]
      currentChars = 'l_english:\n'.length + cost
    } else {
      current.push(entry)
      currentChars += cost
    }
  }
  if (current.length > 0) groups.push(current)

  return groups.map((group) => ({ entries: group, context: buildContext(group, entries) }))
}

export function formatChunk(chunk: TranslationChunk): string {
  const lines: string[] = []
  if (chunk.context.length > 0) {
    lines.push('# КОНТЕКСТ (уже переведено, НЕ переводить и НЕ выводить)\n')
    for (const e of chunk.context) lines.push(contextLine(e))
    lines.push('\n')
  }
  lines.push('# ПЕРЕВЕСТИ\n', 'l_english:\n')
  for (const e of chunk.entries) lines.push(entryLine(e))
  return lines.join('')
}

export function parseResponse(response: string, knownKeys: Set<string>): Map<string, string> {
  const result = new Map<string, string>()
  const lineRe = /^\s+([\w.:@\-]+)(?::(\d+))?\s+"(.*)"\s*$/
  for (const line of response.split('\n')) {
    const m = line.match(lineRe)
    if (!m) continue
    const [, rawKey, , text] = m
    // The key class also matches ":0", so strip the index to get the bare key
    const key = rawKey.replace(/:\d+$/, '')
    if (knownKeys.has(key)) result.set(key, unescapeQuotes(text))
  }
  return result
}

export function parseGlossarySuggestions(response: string): GlossarySuggestion[] {
  const out: GlossarySuggestion[] = []
  const re = /^\s*#\s*GLOSSARY\s+(.+?)\s*=>\s*(.+?)\s*$/i
  for (const line of response.split('\n')) {
    const m = line.match(re)
    if (!m) continue
    const sourceTerm = m[1].replace(/^["'«]|["'»]$/g, '').trim()
    const targetTerm = m[2].replace(/^["'«]|["'»]$/g, '').trim()
    if (sourceTerm && targetTerm) out.push({ sourceTerm, targetTerm })
  }
  return out
}

export function withProtocol(systemPrompt: string): string {
  return systemPrompt + PROTOCOL_ADDENDUM
}

export interface GlossaryTerm {
  sourceTerm: string
  targetTerm: string
}

/**
 * Full system prompt for one chunk: style prompt + protocol + only the glossary terms
 * that actually occur in the chunk (or its context), so big glossaries don't bloat requests.
 */
export function buildChunkPrompt(
  basePrompt: string,
  glossary: readonly GlossaryTerm[] | undefined,
  chunk: TranslationChunk,
): string {
  const prompt = withProtocol(basePrompt)
  if (!glossary || glossary.length === 0) return prompt

  const haystack = [...chunk.entries, ...chunk.context]
    .map((e) => e.originalText)
    .join('\n')
    .toLowerCase()
  const relevant = glossary.filter(
    (g) => g.sourceTerm.trim() !== '' && haystack.includes(g.sourceTerm.toLowerCase()),
  )
  if (relevant.length === 0) return prompt

  const lines = relevant.map((g) => `  ${g.sourceTerm} → ${g.targetTerm}`).join('\n')
  return `${prompt}\n\nГлоссарий (обязательно использовать при переводе этих терминов):\n${lines}`
}

export interface PreparedRun {
  /** Translations needing no API call */
  instant: Map<string, string>
  chunks: TranslationChunk[]
  /** Adds the shared translation to entries with identical English text */
  expand: (updates: Map<string, string>) => Map<string, string>
}

export function prepareRun(entries: TranslationEntry[], options: TranslateOptions): PreparedRun {
  const plan = planWork(entries, options.memory)
  const chunks = buildChunks(entries, options.maxChunkChars, plan.skip)
  const expand = (updates: Map<string, string>): Map<string, string> => {
    const out = new Map(updates)
    for (const [key, text] of updates) {
      for (const dup of plan.duplicates.get(key) ?? []) out.set(dup, text)
    }
    return out
  }
  return { instant: plan.instant, chunks, expand }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TranslateProgress {
  currentChunk: number
  totalChunks: number
  translatedCount: number
  streamingText?: string
  retrying?: RetryState
}

export interface TranslateOptions {
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
          ? `\n\nВНИМАНИЕ: в прошлой попытке были потеряны или изменены переменные и коды в строках: ${invalidKeys.join(', ')}. Сохрани все $...$, §X, [...], £...£, @...@ и \\n точно как в оригинале.`
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
      const { valid, invalidKeys: bad } = splitValid(pending, got)
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
