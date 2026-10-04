import type { TranslationEntry } from '@/types'

export interface ParseResult {
  language: string
  entries: TranslationEntry[]
}

/**
 * Parses a Paradox localisation .yml file (Stellaris, Crusader Kings III, ...).
 *
 * Format:
 *   l_english:
 *    ## Section Header
 *    KEY_NAME:0 "Text here"            (versioned, Stellaris-style)
 *    KEY_NAME2: "More text"            (unversioned, CK3-style)
 *
 * A value ends at the last quote of its line (Paradox allows unescaped quotes inside),
 * or continues on the next lines if the line has no closing quote.
 */
export function parseLoc(rawText: string): ParseResult {
  // Strip UTF-8 BOM if present
  const text = rawText.startsWith('﻿') ? rawText.slice(1) : rawText

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
    const trimmed = lines[i].trim()

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

    // Entry: KEY:INDEX "text", KEY: "text" (or, leniently, KEY "text")
    const entryStart = trimmed.match(/^([\w.@\-]+)(?::(\d*))?\s*"/)
    if (entryStart) {
      const key = entryStart[1]
      const index = entryStart[2] ? parseInt(entryStart[2], 10) : null

      const rest = trimmed.slice(trimmed.indexOf('"', key.length) + 1)
      let fullValue: string
      const closeIdx = findClosingQuote(rest)
      if (closeIdx !== -1) {
        fullValue = rest.slice(0, closeIdx)
      } else {
        // Multi-line: keep reading until a line closes the value
        fullValue = rest
        let closed = false
        while (!closed && i + 1 < lines.length) {
          i++
          const closeIdx2 = findClosingQuote(lines[i])
          if (closeIdx2 !== -1) {
            fullValue += '\n' + lines[i].slice(0, closeIdx2)
            closed = true
          } else {
            fullValue += '\n' + lines[i]
          }
        }
      }

      entries.push({
        key,
        index,
        originalText: fullValue.replace(/\\"/g, '"'),
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
 * Index of the quote that closes a value on this line, or -1 if the value continues.
 * It is the first quote followed only by whitespace and an optional `# comment`, so
 * unescaped quotes inside the text don't truncate it. A quote preceded by an odd number
 * of backslashes is escaped and cannot close the value.
 */
function findClosingQuote(s: string): number {
  const m = s.match(/^(.*?)"\s*(?:#.*)?$/)
  if (!m) return -1
  const value = m[1]
  const trailing = value.length - value.replace(/\\+$/, '').length
  return trailing % 2 === 1 ? -1 : value.length
}

export async function parseFile(file: File): Promise<ParseResult> {
  return parseLoc(await file.text())
}
