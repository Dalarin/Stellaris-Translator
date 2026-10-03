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
    // Parser unescapes \" to ", so re-escape (normalise first to stay idempotent)
    const escaped = text
      .replace(/\\"/g, '"')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
    const indexPart = (entry.index !== null && !isNaN(entry.index))
      ? `:${entry.index}`
      : '';

    lines.push(` ${entry.key}${indexPart} "${escaped}"\n`);
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
    .split(`l_${sourceLang}`).join(`l_${targetLang}`)
    // localisation/english/... → localisation/russian/...
    .replace(new RegExp(`(^|/)${sourceLang}(?=/)`, 'g'), `$1${targetLang}`)
}
