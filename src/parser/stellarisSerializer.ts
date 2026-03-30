import type { TranslationFile, TranslationEntry } from '@/types'

/**
 * Serializes a TranslationFile back to Stellaris YAML format.
 * Uses translatedText if available, falls back to originalText.
 * Outputs the target language header (e.g. l_russian:)
 */
export function serializeToStellaris(
  file: TranslationFile,
  targetLanguage = 'russian'
): string {
  const lines: string[] = [`l_${targetLanguage}:\n`]

  let lastCategory: string | null | undefined = undefined

  for (const entry of file.entries) {
    // Emit category header if it changed
    if (entry.category !== lastCategory) {
      if (entry.category) {
        lines.push(` ## ${entry.category}\n`)
      }
      lastCategory = entry.category
    }

    const text = entry.translatedText || entry.originalText
    // Escape double quotes in the text
    const escaped = text.replace(/"/g, '\\"')
    lines.push(` ${entry.key}:${entry.index} "${escaped}"\n`)
  }

  return lines.join('')
}

/**
 * Returns the export path for a file, replacing the source language with target language.
 */
export function getExportPath(
  relativePath: string,
  sourceLang = 'english',
  targetLang = 'russian'
): string {
  return relativePath
    .replace(`l_${sourceLang}`, `l_${targetLang}`)
    .replace(`_l_${sourceLang}`, `_l_${targetLang}`)
}
