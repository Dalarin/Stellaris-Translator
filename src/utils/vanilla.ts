import { parseFile } from '@/parser/stellarisParser'
import { isTrivial, tokensMatch } from '@/services/translationPrep'
import type { TranslationEntry } from '@/types'

/**
 * Pairs vanilla EN and RU localisation by key and returns exact English text → official
 * Russian text. Used as translation memory, never as a per-key source.
 */
export async function buildVanillaPairs(
  enFiles: Map<string, File>,
  ruFiles: Map<string, File>,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const ru = new Map<string, TranslationEntry>()
  const total = enFiles.size + ruFiles.size
  let done = 0

  for (const file of ruFiles.values()) {
    try {
      for (const e of (await parseFile(file)).entries) if (!ru.has(e.key)) ru.set(e.key, e)
    } catch { /* skip unreadable file */ }
    onProgress?.(++done, total)
  }

  const pairs = new Map<string, string>()
  for (const file of enFiles.values()) {
    try {
      for (const en of (await parseFile(file)).entries) {
        const r = ru.get(en.key)
        if (!r || !r.originalText || isTrivial(en.originalText)) continue
        // Different version index ⇒ the RU text belongs to an older EN text
        if (en.index !== null && r.index !== null && en.index !== r.index) continue
        if (!tokensMatch(en.originalText, r.originalText)) continue
        if (!pairs.has(en.originalText)) pairs.set(en.originalText, r.originalText)
      }
    } catch { /* skip unreadable file */ }
    onProgress?.(++done, total)
  }
  return pairs
}
