import type { TranslationEntry, TranslationFile } from '@/types'

// Everything the game interprets and the translation must keep verbatim:
// $VAR$, §Y / §!, [Root.GetName], £icon£, @icon@, %SEQ%, literal \n
const TOKEN_RE = /\$[^$\s"]*\$|§.|\[[^\]\n"]*\]|£[^£\s"]*£|@\w+@?|%\w+%|\\n/g

export function extractTokens(text: string): string[] {
  return (text.match(TOKEN_RE) ?? []).sort()
}

/** True when `translated` keeps exactly the same game tokens as `original`. */
export function tokensMatch(original: string, translated: string): boolean {
  if (original.trim() !== '' && translated.trim() === '') return false
  const a = extractTokens(original)
  const b = extractTokens(translated)
  return a.length === b.length && a.every((t, i) => t === b[i])
}

/** Nothing to translate: only tokens, digits, punctuation and whitespace. */
export function isTrivial(text: string): boolean {
  return text.replace(TOKEN_RE, '').replace(/[\s\d\p{P}\p{S}]/gu, '') === ''
}

export function escapeQuotes(text: string): string {
  return text.replace(/\\"/g, '"').replace(/"/g, '\\"')
}

export function unescapeQuotes(text: string): string {
  return text.replace(/\\"/g, '"')
}

function isDone(e: TranslationEntry): boolean {
  return e.status === 'translated' || e.status === 'approved'
}

/**
 * Translation memory: exact English text → existing translation, taken from every
 * translated/approved entry in the project. Approved translations win.
 */
export function buildTranslationMemory(files: TranslationFile[]): Map<string, string> {
  const memory = new Map<string, string>()
  const fromApproved = new Set<string>()
  for (const file of files) {
    for (const e of file.entries) {
      if (!isDone(e) || !e.translatedText || isTrivial(e.originalText)) continue
      if (!tokensMatch(e.originalText, e.translatedText)) continue
      const approved = e.status === 'approved'
      if (!memory.has(e.originalText) || (approved && !fromApproved.has(e.originalText))) {
        memory.set(e.originalText, e.translatedText)
        if (approved) fromApproved.add(e.originalText)
      }
    }
  }
  return memory
}

export interface WorkPlan {
  /** Translations known without calling the API (trivial strings, memory hits) */
  instant: Map<string, string>
  /** Keys that must not be sent to the model (instant + duplicates of another entry) */
  skip: Set<string>
  /** representative key → keys with identical English text that reuse its translation */
  duplicates: Map<string, string[]>
}

export function planWork(entries: TranslationEntry[], memory?: Map<string, string>): WorkPlan {
  const instant = new Map<string, string>()
  const skip = new Set<string>()
  const duplicates = new Map<string, string[]>()
  const representative = new Map<string, string>()

  for (const e of entries) {
    if (isDone(e)) continue

    if (isTrivial(e.originalText)) {
      instant.set(e.key, e.originalText)
      skip.add(e.key)
      continue
    }

    const known = memory?.get(e.originalText)
    if (known !== undefined) {
      instant.set(e.key, known)
      skip.add(e.key)
      continue
    }

    const rep = representative.get(e.originalText)
    if (rep === undefined) {
      representative.set(e.originalText, e.key)
    } else {
      const list = duplicates.get(rep) ?? []
      list.push(e.key)
      duplicates.set(rep, list)
      skip.add(e.key)
    }
  }

  return { instant, skip, duplicates }
}

/** Splits model output into translations that keep all game tokens and ones that don't. */
export function splitValid(
  chunkEntries: TranslationEntry[],
  got: Map<string, string>,
): { valid: Map<string, string>; invalidKeys: string[] } {
  const byKey = new Map(chunkEntries.map((e) => [e.key, e]))
  const valid = new Map<string, string>()
  const invalidKeys: string[] = []
  for (const [key, text] of got) {
    const entry = byKey.get(key)
    if (!entry) continue
    if (tokensMatch(entry.originalText, text)) valid.set(key, text)
    else invalidKeys.push(key)
  }
  return { valid, invalidKeys }
}

/** Pure application of translations to a file's entries. */
export function applyTranslations(
  entries: TranslationEntry[],
  updates: Map<string, string>,
): TranslationEntry[] {
  return entries.map((e) => {
    const text = updates.get(e.key)
    if (text === undefined) return e
    return { ...e, translatedText: text, status: 'translated', previousOriginalText: undefined, minorChange: undefined }
  })
}
