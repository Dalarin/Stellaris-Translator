import { extractTokens, isTrivial } from '@/services/translationPrep'
import { getGameProfile, type GameProfile } from '@/games'
import type { GlossaryEntry, TranslationEntry } from '@/types'

export type QaKind = 'tokens' | 'english' | 'length' | 'glossary'

export interface QaIssue {
  key: string
  kind: QaKind
  message: string
}

export const QA_KIND_LABEL: Record<QaKind, string> = {
  tokens: 'Переменные / коды',
  english: 'Остался английский',
  length: 'Длина',
  glossary: 'Глоссарий',
}

/** Multiset difference a − b, as a readable list. */
function missingFrom(a: string[], b: string[]): string[] {
  const rest = [...b]
  const out: string[] = []
  for (const t of a) {
    const i = rest.indexOf(t)
    if (i === -1) out.push(t)
    else rest.splice(i, 1)
  }
  return out
}

/** Russian inflects, so compare word stems (drop the last 2 letters of longer words). */
function stem(word: string): string {
  return word.length > 4 ? word.slice(0, -2) : word
}

export function checkEntries(
  entries: TranslationEntry[],
  glossary: readonly GlossaryEntry[],
  game: GameProfile = getGameProfile(),
): QaIssue[] {
  const terms = glossary.filter((g) => !g.status || g.status === 'accepted')
  const issues: QaIssue[] = []

  for (const e of entries) {
    if (e.status === 'missing' || !e.translatedText || isTrivial(e.originalText, game)) continue
    const orig = e.originalText
    const tr = e.translatedText

    // Missing or extra game tokens
    const ot = extractTokens(orig, game)
    const tt = extractTokens(tr, game)
    const lost = missingFrom(ot, tt)
    const extra = missingFrom(tt, ot)
    if (lost.length > 0 || extra.length > 0) {
      const parts: string[] = []
      if (lost.length > 0) parts.push(`потеряно: ${lost.join(' ')}`)
      if (extra.length > 0) parts.push(`лишнее: ${extra.join(' ')}`)
      issues.push({ key: e.key, kind: 'tokens', message: parts.join('; ') })
    }

    // Latin words but no Cyrillic at all — probably left untranslated
    const plain = tr.replace(game.tokenRegex, ' ')
    if (tr === orig) {
      if (/[A-Za-z]{4,}/.test(plain) && e.status !== 'approved') {
        issues.push({ key: e.key, kind: 'english', message: 'Перевод совпадает с оригиналом' })
      }
    } else if (/[A-Za-z]{3,}/.test(plain) && !/[А-Яа-яЁё]/.test(plain)) {
      issues.push({ key: e.key, kind: 'english', message: 'В переводе нет кириллицы' })
    }

    // Suspicious length (UI overflow / dropped sentences)
    if (orig.length > 40) {
      if (tr.length > orig.length * 2.2 + 20) {
        issues.push({ key: e.key, kind: 'length', message: `Перевод намного длиннее (${tr.length} против ${orig.length})` })
      } else if (tr.length < orig.length * 0.3) {
        issues.push({ key: e.key, kind: 'length', message: `Перевод намного короче (${tr.length} против ${orig.length})` })
      }
    }

    // Glossary term in the original but not (in any form) in the translation
    const lowerOrig = orig.toLowerCase()
    const lowerTr = tr.toLowerCase()
    for (const g of terms) {
      if (!g.sourceTerm || !lowerOrig.includes(g.sourceTerm.toLowerCase())) continue
      const stems = g.targetTerm.toLowerCase().split(/\s+/).filter(Boolean).map(stem)
      if (stems.length > 0 && !stems.every((s) => lowerTr.includes(s))) {
        issues.push({ key: e.key, kind: 'glossary', message: `${g.sourceTerm} → ${g.targetTerm}` })
      }
    }
  }
  return issues
}
