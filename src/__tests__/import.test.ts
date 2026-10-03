import { describe, expect, it } from 'vitest'
import {
  buildGlobalExistingMap,
  emptyReport,
  findExistingFile,
  mergeEntry,
  type MergeContext,
} from '@/hooks/useImport'
import { buildTranslationMemory } from '@/services/translationPrep'
import { estimateRun } from '@/services/estimate'
import type { TranslationEntry, TranslationFile } from '@/types'

const entry = (over: Partial<TranslationEntry> & { key: string }): TranslationEntry => ({
  index: 0,
  originalText: 'Text',
  translatedText: '',
  category: null,
  status: 'missing',
  ...over,
})

const file = (id: string, path: string, entries: TranslationEntry[]): TranslationFile => ({
  id,
  projectId: 'p',
  relativePath: path,
  language: 'english',
  entries,
})

function ctx(over: Partial<MergeContext> = {}): MergeContext {
  return {
    existingMap: new Map(),
    globalExistingMap: new Map(),
    referenceMap: new Map(),
    ruMap: new Map(),
    memory: new Map(),
    options: { markRuAsApproved: false, vanillaMemory: new Map() },
    ...over,
  }
}

describe('import merge', () => {
  it('keeps an unchanged translation', () => {
    const old = entry({ key: 'a', originalText: 'Hello', translatedText: 'Привет', status: 'translated' })
    const report = emptyReport()
    const out = mergeEntry(entry({ key: 'a', originalText: 'Hello' }), ctx({ existingMap: new Map([['a', old]]) }), report)
    expect(out).toMatchObject({ status: 'translated', translatedText: 'Привет' })
    expect(report.kept).toBe(1)
  })

  it('marks changed English as outdated and remembers the previous text', () => {
    const old = entry({ key: 'a', originalText: 'Deal 10 damage to all enemies now', translatedText: 'Нанесите 10 урона', status: 'approved' })
    const report = emptyReport()
    const out = mergeEntry(
      entry({ key: 'a', originalText: 'Deal 20 damage to all enemies now' }),
      ctx({ existingMap: new Map([['a', old]]) }),
      report,
    )
    expect(out.status).toBe('outdated')
    expect(out.previousOriginalText).toBe('Deal 10 damage to all enemies now')
    expect(out.minorChange).toBe(true)
    expect(report).toMatchObject({ outdated: 1, minor: 1 })
  })

  it('keeps outdated entries outdated across re-imports, tied to the text they were translated for', () => {
    const old = entry({
      key: 'a', originalText: 'New text', translatedText: 'Старый перевод',
      status: 'outdated', previousOriginalText: 'Original text',
    })
    const out = mergeEntry(entry({ key: 'a', originalText: 'New text' }), ctx({ existingMap: new Map([['a', old]]) }), emptyReport())
    expect(out.status).toBe('outdated')
    expect(out.previousOriginalText).toBe('Original text')
  })

  it('finds the translation under the same key in another file', () => {
    const elsewhere = entry({ key: 'a', originalText: 'Hello', translatedText: 'Привет', status: 'translated' })
    const global = buildGlobalExistingMap([file('f1', 'old/a.yml', [elsewhere])])
    const report = emptyReport()
    const out = mergeEntry(entry({ key: 'a', originalText: 'Hello' }), ctx({ globalExistingMap: global }), report)
    expect(out.translatedText).toBe('Привет')
    expect(report.movedFromOtherFile).toBe(1)
  })

  it('falls back to exact-text memory when the key was renamed', () => {
    const memory = buildTranslationMemory([
      file('f1', 'a.yml', [entry({ key: 'old_key', originalText: 'Hello there', translatedText: 'Привет', status: 'translated' })]),
    ])
    const report = emptyReport()
    const out = mergeEntry(entry({ key: 'new_key', originalText: 'Hello there' }), ctx({ memory }), report)
    expect(out).toMatchObject({ status: 'translated', translatedText: 'Привет' })
    expect(report.fromMemory).toBe(1)
  })

  it('copies strings with nothing to translate and flags the rest as missing', () => {
    const report = emptyReport()
    expect(mergeEntry(entry({ key: 'a', originalText: '$VALUE$' }), ctx(), report).status).toBe('translated')
    expect(mergeEntry(entry({ key: 'b', originalText: 'Something' }), ctx(), report).status).toBe('missing')
    expect(report).toMatchObject({ trivial: 1, missing: 1, entries: 2 })
  })

  it('prefers approved translations when the key exists in several files', () => {
    const map = buildGlobalExistingMap([
      file('f1', 'a.yml', [entry({ key: 'k', translatedText: 'draft', status: 'translated' })]),
      file('f2', 'b.yml', [entry({ key: 'k', translatedText: 'final', status: 'approved' })]),
    ])
    expect(map.get('k')?.translatedText).toBe('final')
  })
})

describe('file matching', () => {
  const a = file('a', 'localisation/english/events_l_english.yml', [])
  const b = file('b', 'localisation/english/tech/events_l_english.yml', [])

  it('prefers the exact path', () => {
    expect(findExistingFile('localisation/english/tech/events_l_english.yml', [a, b], new Set())?.id).toBe('b')
  })

  it('uses the file name only when unambiguous', () => {
    expect(findExistingFile('moved/techs_l_english.yml', [file('t', 'old/techs_l_english.yml', [])], new Set())?.id).toBe('t')
    expect(findExistingFile('other/events_l_english.yml', [a, b], new Set())).toBeUndefined()
  })

  it('uses the parent folder to disambiguate same-named files', () => {
    expect(findExistingFile('x/tech/events_l_english.yml', [a, b], new Set())?.id).toBe('b')
  })

  it('never hands the same existing file to two new files', () => {
    expect(findExistingFile('localisation/english/events_l_english.yml', [a], new Set(['a']))).toBeUndefined()
  })
})

describe('estimate', () => {
  it('counts requests and tokens, excluding free entries', () => {
    const entries = [
      entry({ key: 'a', originalText: '$X$' }),
      entry({ key: 'b', originalText: 'Some real sentence to translate' }),
      entry({ key: 'c', originalText: 'Some real sentence to translate' }),
    ]
    const e = estimateRun(entries, 'PROMPT', {})
    expect(e.requests).toBe(1)
    expect(e.entriesToTranslate).toBe(1)
    expect(e.entriesFree).toBe(2)
    expect(e.inputTokens).toBeGreaterThan(0)
    expect(e.outputTokens).toBeGreaterThan(0)
  })
})
