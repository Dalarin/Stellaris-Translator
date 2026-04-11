import type { TranslationFile, TranslationEntry } from '@/types'

/**
 * Builds a lookup map from key → TranslationEntry across all provided files.
 * If the same key appears in multiple files, the first occurrence wins.
 */
export function buildEntryMap(files: TranslationFile[]): Map<string, TranslationEntry> {
  const map = new Map<string, TranslationEntry>()
  for (const file of files) {
    for (const entry of file.entries) {
      if (!map.has(entry.key)) {
        map.set(entry.key, entry)
      }
    }
  }
  return map
}

/**
 * Tries to fill in a translation for `enEntry` using the reference map.
 *
 * Rules:
 * - Key found + originalText matches + has translatedText → status: 'translated'
 * - Key found + originalText differs + has translatedText → status: 'outdated'
 * - Key not found or no translatedText → returns enEntry unchanged
 */
export function matchEntry(
  enEntry: TranslationEntry,
  referenceMap: Map<string, TranslationEntry>
): TranslationEntry {
  const ref = referenceMap.get(enEntry.key)
  if (!ref || !ref.translatedText) return enEntry

  if (ref.originalText === enEntry.originalText) {
    return { ...enEntry, translatedText: ref.translatedText, status: 'translated' }
  } else {
    return { ...enEntry, translatedText: ref.translatedText, status: 'outdated' }
  }
}
