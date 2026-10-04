import { describe, expect, it } from 'vitest'
import { parseLoc as parseStellaris } from '@/parser/locParser'
import { serializeLoc as serializeToStellaris, getExportPath } from '@/parser/locSerializer'
import {
  applyTranslations,
  buildTranslationMemory,
  extractTokens,
  isTrivial,
  planWork,
  splitValid,
  tokensMatch,
} from '@/services/translationPrep'
import { buildChunks, buildChunkPrompt, formatChunk, parseGlossarySuggestions, parseResponse, prepareRun } from '@/services/chunking'
import { diffWords, similarity } from '@/utils/textDiff'
import { checkEntries } from '@/utils/qaChecks'
import type { TranslationEntry, TranslationFile } from '@/types'

const entry = (over: Partial<TranslationEntry> & { key: string }): TranslationEntry => ({
  index: 0,
  originalText: 'Text',
  translatedText: '',
  category: null,
  status: 'missing',
  ...over,
})

const file = (entries: TranslationEntry[]): TranslationFile => ({
  id: 'f1',
  projectId: 'p1',
  relativePath: 'localisation/english/mod_l_english.yml',
  language: 'english',
  entries,
})

describe('parser', () => {
  it('splits key and index', () => {
    const { entries, language } = parseStellaris('l_english:\n ev.1.a:0 "Go"\n b_key:12 "x"\n c "y"\n')
    expect(language).toBe('english')
    expect(entries.map((e) => [e.key, e.index])).toEqual([
      ['ev.1.a', 0],
      ['b_key', 12],
      ['c', null],
    ])
  })

  it('accepts @ in keys and unescapes quotes', () => {
    const { entries } = parseStellaris('l_english:\n k@x:0 "The \\"Void\\" Cult"\n')
    expect(entries[0].key).toBe('k@x')
    expect(entries[0].originalText).toBe('The "Void" Cult')
  })

  it('keeps literal \\n and reads categories and BOM', () => {
    const { entries } = parseStellaris('﻿l_english:\n ## Events\n a:0 "one\\ntwo"\n')
    expect(entries[0].originalText).toBe('one\\ntwo')
    expect(entries[0].category).toBe('Events')
  })

  it('reads multi-line values', () => {
    const { entries } = parseStellaris('l_english:\n a:0 "line1\nline2"\n b:0 "x"\n')
    expect(entries).toHaveLength(2)
    expect(entries[0].originalText).toBe('line1\nline2')
  })
})

describe('serializer', () => {
  it('round-trips quotes, indexes and \\n', () => {
    const src = 'l_english:\n a:0 "The \\"Void\\" Cult"\n b:3 "x\\ny"\n c: "plain"\n'
    const parsed = parseStellaris(src)
    const out = serializeToStellaris(file(parsed.entries.map((e) => ({ ...e, translatedText: e.originalText }))), 'english')
    expect(out).toBe(src)
  })

  it('is idempotent for already escaped legacy translations', () => {
    const out = serializeToStellaris(
      file([entry({ key: 'a', translatedText: 'Он сказал \\"да\\"', status: 'translated' })]),
      'russian',
    )
    expect(out).toContain('"Он сказал \\"да\\""')
  })

  it('falls back to the original text when untranslated', () => {
    const out = serializeToStellaris(file([entry({ key: 'a', originalText: 'Hello' })]), 'russian')
    expect(out).toBe('l_russian:\n a:0 "Hello"\n')
  })

  it('renames language in file name and folder', () => {
    expect(getExportPath('localisation/english/a_l_english.yml', 'english', 'russian')).toBe(
      'localisation/russian/a_l_russian.yml',
    )
  })
})

describe('tokens', () => {
  it('extracts game tokens', () => {
    expect(extractTokens('§YHi $NAME$§! [Root.GetName] £energy£ @icon@ \\n')).toHaveLength(7)
  })

  it('detects lost and kept tokens', () => {
    expect(tokensMatch('Hello $NAME$ §Y', 'Привет §Y')).toBe(false)
    expect(tokensMatch('Hello $NAME$', 'Привет $NAME$')).toBe(true)
    expect(tokensMatch('Hello', '')).toBe(false)
  })

  it('detects trivial strings', () => {
    expect(isTrivial('§Y$X$§! 12')).toBe(true)
    expect(isTrivial('')).toBe(true)
    expect(isTrivial('Energy $X$')).toBe(false)
  })
})

describe('work planning', () => {
  it('skips trivial, memory hits and duplicates', () => {
    const entries = [
      entry({ key: 'a', originalText: '$VALUE$' }),
      entry({ key: 'b', originalText: 'Known' }),
      entry({ key: 'c', originalText: 'Same text' }),
      entry({ key: 'd', originalText: 'Same text' }),
      entry({ key: 'e', originalText: 'Unique' }),
      entry({ key: 'f', originalText: 'Done', translatedText: 'Готово', status: 'translated' }),
    ]
    const plan = planWork(entries, new Map([['Known', 'Известно']]))
    expect(plan.instant.get('a')).toBe('$VALUE$')
    expect(plan.instant.get('b')).toBe('Известно')
    expect(plan.duplicates.get('c')).toEqual(['d'])
    expect([...plan.skip].sort()).toEqual(['a', 'b', 'd'])
  })

  it('expands shared translations to duplicates', () => {
    const entries = [
      entry({ key: 'c', originalText: 'Same text' }),
      entry({ key: 'd', originalText: 'Same text' }),
    ]
    const run = prepareRun(entries, {})
    expect(run.chunks).toHaveLength(1)
    expect(run.chunks[0].entries.map((e) => e.key)).toEqual(['c'])
    expect([...run.expand(new Map([['c', 'Тот же текст']]))]).toEqual([
      ['c', 'Тот же текст'],
      ['d', 'Тот же текст'],
    ])
  })

  it('memory prefers approved translations and ignores broken ones', () => {
    const mem = buildTranslationMemory([
      file([
        entry({ key: 'a', originalText: 'Hi', translatedText: 'Привет', status: 'translated' }),
        entry({ key: 'b', originalText: 'Hi', translatedText: 'Здравствуйте', status: 'approved' }),
        entry({ key: 'c', originalText: 'Cost $X$', translatedText: 'Цена', status: 'translated' }),
      ]),
    ])
    expect(mem.get('Hi')).toBe('Здравствуйте')
    expect(mem.has('Cost $X$')).toBe(false)
  })

  it('splits valid and invalid model output', () => {
    const chunk = [entry({ key: 'a', originalText: 'Hi $N$' }), entry({ key: 'b', originalText: 'Bye' })]
    const { valid, invalidKeys } = splitValid(
      chunk,
      new Map([['a', 'Привет'], ['b', 'Пока']]),
    )
    expect([...valid.keys()]).toEqual(['b'])
    expect(invalidKeys).toEqual(['a'])
  })

  it('applyTranslations marks entries translated and clears outdated info', () => {
    const [e] = applyTranslations(
      [entry({ key: 'a', status: 'outdated', previousOriginalText: 'old', minorChange: true })],
      new Map([['a', 'Новый']]),
    )
    expect(e).toMatchObject({ translatedText: 'Новый', status: 'translated' })
    expect(e.previousOriginalText).toBeUndefined()
    expect(e.minorChange).toBeUndefined()
  })
})

describe('chunks and prompts', () => {
  const entries = [
    entry({ key: 'ev.1.name', originalText: 'Old', translatedText: 'Старый', status: 'translated' }),
    entry({
      key: 'ev.1.desc',
      originalText: 'New desc',
      translatedText: 'Старое описание',
      status: 'outdated',
      previousOriginalText: 'Old desc',
    }),
    entry({ key: 'ev.1.a', originalText: 'Go' }),
    entry({ key: 'zzz.2', originalText: 'Far away', translatedText: 'Далеко', status: 'approved' }),
  ]

  it('adds translated context and outdated hints', () => {
    const chunks = buildChunks(entries)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].entries.map((e) => e.key)).toEqual(['ev.1.desc', 'ev.1.a'])
    expect(chunks[0].context.map((e) => e.key)).toContain('ev.1.name')
    const text = formatChunk(chunks[0])
    expect(text).toContain('Прежний EN: "Old desc"')
    expect(text).toContain('Прежний RU: "Старое описание"')
    expect(text).toContain('ev.1.name:0 "Old" => "Старый"')
  })

  it('splits chunks by size', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ key: `k${i}`, originalText: `Text number ${i}` }))
    expect(buildChunks(many, 120).length).toBeGreaterThan(1)
  })

  it('escapes quotes in prompts and unescapes them in responses', () => {
    const chunk = buildChunks([entry({ key: 'q', originalText: 'A "quoted" word' })])[0]
    expect(formatChunk(chunk)).toContain('"A \\"quoted\\" word"')
    const got = parseResponse(' q:0 "Слово \\"в кавычках\\""', new Set(['q']))
    expect(got.get('q')).toBe('Слово "в кавычках"')
  })

  it('parses responses with indexes and ignores unknown keys', () => {
    const got = parseResponse(' a:0 "А"\n b "Б"\n zz:1 "Ъ"', new Set(['a', 'b']))
    expect([...got]).toEqual([['a', 'А'], ['b', 'Б']])
  })

  it('includes only glossary terms present in the chunk', () => {
    const chunk = buildChunks([entry({ key: 'k', originalText: 'The Void Cult rises' })])[0]
    const prompt = buildChunkPrompt('BASE', [
      { sourceTerm: 'void cult', targetTerm: 'Культ Пустоты' },
      { sourceTerm: 'Hutt', targetTerm: 'хатт' },
    ], chunk)
    expect(prompt).toContain('void cult → Культ Пустоты')
    expect(prompt).not.toContain('Hutt')
  })

  it('parses glossary suggestion lines', () => {
    expect(parseGlossarySuggestions('l_russian:\n a:0 "x"\n#GLOSSARY Void Cult => Культ Пустоты\n# GLOSSARY "Sith" => «ситх»')).toEqual([
      { sourceTerm: 'Void Cult', targetTerm: 'Культ Пустоты' },
      { sourceTerm: 'Sith', targetTerm: 'ситх' },
    ])
  })
})

describe('text diff', () => {
  it('reports changed words and re-joins losslessly', () => {
    const parts = diffWords('Deal 10 damage to enemies', 'Deal 20 damage to all enemies')
    expect(parts.filter((p) => p.type !== 'add').map((p) => p.text).join('')).toBe('Deal 10 damage to enemies')
    expect(parts.filter((p) => p.type !== 'del').map((p) => p.text).join('')).toBe('Deal 20 damage to all enemies')
    expect(parts.some((p) => p.type === 'del' && p.text.includes('10'))).toBe(true)
  })

  it('measures similarity', () => {
    expect(similarity('a b c', 'a b c')).toBe(1)
    expect(similarity('one two three four five six', 'one two three four five seven')).toBeGreaterThan(0.8)
    expect(similarity('a b c', 'x y z')).toBe(0)
  })
})

describe('qa checks', () => {
  it('finds lost tokens, untranslated english, and missing glossary terms', () => {
    const issues = checkEntries(
      [
        entry({ key: 'a', originalText: 'Hello $NAME$ here', translatedText: 'Привет тут', status: 'translated' }),
        entry({ key: 'b', originalText: 'Some English words here', translatedText: 'Other English words', status: 'translated' }),
        entry({ key: 'c', originalText: 'The Void Cult rises', translatedText: 'Секта поднимается', status: 'translated' }),
        entry({ key: 'd', originalText: 'The Void Cult rises', translatedText: 'Культ Пустоты поднимается', status: 'translated' }),
      ],
      [{ id: '1', projectId: 'p', sourceTerm: 'Void Cult', targetTerm: 'Культ Пустоты' }],
    )
    const kinds = issues.map((i) => `${i.key}:${i.kind}`).sort()
    expect(kinds).toEqual(['a:tokens', 'b:english', 'c:glossary'])
  })
})
