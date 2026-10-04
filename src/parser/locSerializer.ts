import type { TranslationFile } from '@/types'

/**
 * Serializes a TranslationFile back to Paradox localisation YAML.
 * Uses translatedText if available, falls back to originalText.
 * Outputs the target language header (e.g. l_russian:). Entries that had a version
 * number keep it (`KEY:0 "x"`); the rest stay unversioned (`KEY: "x"`).
 */
export function serializeLoc(file: TranslationFile, targetLanguage = 'russian'): string {
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
      .replace(/\n/g, '\\n')
    const version = entry.index !== null && entry.index !== undefined && !isNaN(entry.index)
      ? String(entry.index)
      : ''

    lines.push(` ${entry.key}:${version} "${escaped}"\n`)
  }

  return lines.join('')
}

/**
 * Returns the export path for a file, replacing the source language with target language
 * in the file name (`_l_english.yml`) and in a language folder (`localization/english/`).
 */
export function getExportPath(
  relativePath: string,
  sourceLang = 'english',
  targetLang = 'russian'
): string {
  return relativePath
    .split(`l_${sourceLang}`).join(`l_${targetLang}`)
    .replace(new RegExp(`(^|/)${sourceLang}(?=/)`, 'g'), `$1${targetLang}`)
}
