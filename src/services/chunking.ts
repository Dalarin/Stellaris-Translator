import type { TranslationEntry } from '@/types'
import { escapeQuotes, planWork, unescapeQuotes } from '@/services/translationPrep'
import {
  DEFAULT_CHUNK_CHARS,
  type GlossarySuggestion,
  type GlossaryTerm,
  type TranslateOptions,
  type TranslationChunk,
} from '@/services/translateTypes'

/** Max chars of already-translated neighbour entries sent as read-only context */
const MAX_CONTEXT_CHARS = 3000
const CONTEXT_NEIGHBOURS = 2

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

function isDone(e: TranslationEntry): boolean {
  return (e.status === 'translated' || e.status === 'approved') && e.translatedText !== ''
}

/** ":0" for versioned keys, ":" for unversioned — the model sees the real file syntax. */
function keyIndexPart(e: TranslationEntry): string {
  return e.index !== null && e.index !== undefined && !isNaN(e.index) ? `:${e.index}` : ':'
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
  const lineRe = /^\s+([\w.@\-]+)(?::\d*)?\s*"(.*)"\s*$/
  for (const line of response.split('\n')) {
    const m = line.match(lineRe)
    if (!m) continue
    const [, key, text] = m
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
  const plan = planWork(entries, options.memory, options.game)
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
