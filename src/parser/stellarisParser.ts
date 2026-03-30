import type { TranslationEntry } from '@/types'

export interface ParseResult {
  language: string
  entries: TranslationEntry[]
}

/**
 * Parses a Stellaris localisation .yml file.
 *
 * Format:
 *   l_english:
 *    ## Section Header
 *    KEY_NAME:0 "Text here"
 *    KEY_NAME2:1 "More text with §YColor§! codes"
 */
export function parseStellaris(rawText: string): ParseResult {
  // Strip UTF-8 BOM if present
  const text = rawText.startsWith('\uFEFF') ? rawText.slice(1) : rawText

  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let language = 'english'
  const entries: TranslationEntry[] = []
  let currentCategory: string | null = null

  // Match language declaration: l_english:
  const langMatch = lines[0]?.match(/^l_(\w+)\s*:/)
  if (langMatch) {
    language = langMatch[1]
  }

  let i = 1
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Section header: ## Header text
    const sectionMatch = trimmed.match(/^##\s*(.*)/)
    if (sectionMatch) {
      currentCategory = sectionMatch[1].trim() || null
      i++
      continue
    }

    // Skip single-hash comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') {
      i++
      continue
    }

    // Entry: KEY:INDEX "text"  (possibly multi-line)
    // Match key:index then opening quote
    const entryStart = trimmed.match(/^([\w.:\-]+)(?::(\d+))?\s+"/)
    if (entryStart) {
      const key = entryStart[1]
      const index = parseInt(entryStart[2]) ?? null;

      // Find the start of the quoted value
      const lineStr = trimmed
      const quoteStart = lineStr.indexOf('"')

      // Collect the full value, handling escaped quotes and multi-line
      let valueAccum = lineStr.slice(quoteStart + 1)
      let closed = false
      let fullValue = ''

      // Check if the closing quote is on the same line
      // We need to find unescaped closing quote
      const closeIdx = findClosingQuote(valueAccum)
      if (closeIdx !== -1) {
        fullValue = valueAccum.slice(0, closeIdx)
        closed = true
      } else {
        fullValue = valueAccum
        // Multi-line: keep reading
        while (!closed && i + 1 < lines.length) {
          i++
          const nextLine = lines[i]
          const closeIdx2 = findClosingQuote(nextLine)
          if (closeIdx2 !== -1) {
            fullValue += '\n' + nextLine.slice(0, closeIdx2)
            closed = true
          } else {
            fullValue += '\n' + nextLine
          }
        }
      }

      // Unescape escaped quotes
      const originalText = fullValue.replace(/\\"/g, '"')

      entries.push({
        key,
        index,
        originalText,
        translatedText: '',
        category: currentCategory,
        status: 'missing',
      })
    }

    i++
  }

  return { language, entries }
}

/**
 * Find the index of the first unescaped closing double-quote in a string.
 * Returns -1 if not found.
 */
function findClosingQuote(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      i++ // skip escaped character
      continue
    }
    if (s[i] === '"') return i
  }
  return -1
}

export async function parseFile(file: File): Promise<ParseResult> {
  const text = await file.text()
  return parseStellaris(text)
}
