import { describe, expect, it } from 'vitest'
import { parseLoc } from '@/parser/locParser'
import { getExportPath } from '@/parser/locSerializer'
import { renderSegments } from '@/parser/colorCodes'
import { buildFileTree, normalizePath } from '@/utils/fileHelpers'
import { calcFileStats, calcProgress, calcTotalStats, filterEntries } from '@/utils/progressCalc'
import { buildEntryMap, matchEntry } from '@/utils/translationMatcher'
import { diffWords, similarity } from '@/utils/textDiff'
import { buildVanillaPairs } from '@/utils/vanilla'
import { estimateCost, estimateRun, sumEstimates } from '@/services/estimate'
import { applyTranslations } from '@/services/translationPrep'
import { GeminiError } from '@/services/geminiError'
import { GeminiRateLimiter } from '@/providers/GeminiRateLimiter'
import { ApiKeyPool } from '@/providers/ApiKeyPool'
import { getGameProfile } from '@/games'
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
  id, projectId: 'p', relativePath: path, language: 'english', entries,
})

describe('locParser edge cases', () => {
  it('reads categories, skips comments and blank lines', () => {
    const { entries } = parseLoc('l_english:\n\n # c\n ## Section A\n a:0 "1"\n ## Section B\n b:0 "2"\n')
    expect(entries.map((e) => [e.key, e.category])).toEqual([['a', 'Section A'], ['b', 'Section B']])
  })

  it('handles CRLF and old Mac line endings', () => {
    expect(parseLoc('l_english:\r\n a:0 "1"\r\n b:0 "2"\r\n').entries).toHaveLength(2)
    expect(parseLoc('l_english:\r a:0 "1"\r b:0 "2"\r').entries).toHaveLength(2)
  })

  it('keeps a value that spans lines and ends with an escaped quote correctly', () => {
    const { entries } = parseLoc('l_english:\n a:0 "line one\\"\nline two"\n b:0 "ok"\n')
    expect(entries).toHaveLength(2)
    expect(entries[0].originalText).toBe('line one"\nline two')
  })

  it('does not end a value at a quote that is followed by more text', () => {
    expect(parseLoc('l_english:\n a: "say "hi" now"\n').entries[0].originalText).toBe('say "hi" now')
  })

  it('treats a trailing comment as outside the value', () => {
    expect(parseLoc('l_english:\n a:0 "text" # note\n').entries[0].originalText).toBe('text')
  })

  it('reads the language from the header and tolerates a missing one', () => {
    expect(parseLoc('l_russian:\n a:0 "x"\n').language).toBe('russian')
    expect(parseLoc('l_english:\n').entries).toEqual([])
  })

  it('ignores lines that are not entries', () => {
    expect(parseLoc('l_english:\n garbage line without quotes\n a:0 "x"\n').entries).toHaveLength(1)
  })

  it('accepts empty values', () => {
    const [e] = parseLoc('l_english:\n a:0 ""\n').entries
    expect(e.originalText).toBe('')
  })
})

describe('export paths', () => {
  it('leaves paths without the language untouched', () => {
    expect(getExportPath('misc/readme.yml', 'english', 'russian')).toBe('misc/readme.yml')
  })

  it('renames every l_english occurrence and the language folder', () => {
    expect(getExportPath('english/a_l_english.yml', 'english', 'russian')).toBe('russian/a_l_russian.yml')
    expect(getExportPath('mods/english_pack/a.yml', 'english', 'russian')).toBe('mods/english_pack/a.yml')
  })
})

describe('colorCodes.renderSegments', () => {
  it('renders styled and plain segments', () => {
    const nodes = renderSegments([
      { text: 'a', color: null },
      { text: 'b', color: '#fff', bold: true },
    ]) as Array<{ props: { style?: Record<string, unknown> } }>
    expect(nodes).toHaveLength(2)
    expect(nodes[0].props.style).toBeUndefined()
    expect(nodes[1].props.style).toMatchObject({ color: '#fff', fontWeight: 700 })
  })
})

describe('file tree and stats', () => {
  const files = [
    file('1', 'localisation/english/a_l_english.yml', [
      entry({ key: 'a', status: 'approved' }),
      entry({ key: 'b', status: 'missing' }),
    ]),
    file('2', 'localisation/english/sub/b_l_english.yml', [
      entry({ key: 'c', status: 'translated' }),
      entry({ key: 'd', status: 'outdated' }),
    ]),
  ]

  it('normalizes Windows paths', () => {
    expect(normalizePath('a\\b\\c.yml')).toBe('a/b/c.yml')
  })

  it('builds a nested tree with aggregated folder stats', () => {
    const [root] = buildFileTree(files)
    expect(root.name).toBe('localisation')
    const english = root.children![0]
    expect(english.stats).toMatchObject({ total: 4, approved: 1, translated: 1, outdated: 1, missing: 1 })
    // folders first, then files
    expect(english.children!.map((c) => c.name)).toEqual(['sub', 'a_l_english.yml'])
  })

  it('computes per-file and project stats and progress', () => {
    expect(calcFileStats(files[0])).toMatchObject({ approved: 1, missing: 1, total: 2 })
    const total = calcTotalStats(files)
    expect(total.total).toBe(4)
    expect(calcProgress(total)).toBe(50)
    expect(calcProgress({ approved: 0, translated: 0, outdated: 0, missing: 0, total: 0 })).toBe(0)
  })

  it('filters entries by status', () => {
    expect(filterEntries(files[1].entries, 'outdated').map((e) => e.key)).toEqual(['d'])
    expect(filterEntries(files[1].entries, 'all')).toHaveLength(2)
  })
})

describe('translationMatcher', () => {
  const ref = buildEntryMap([
    file('r', 'r.yml', [
      entry({ key: 'a', originalText: 'Hello', translatedText: 'Привет', status: 'translated' }),
      entry({ key: 'a', originalText: 'dup', translatedText: 'дубль', status: 'translated' }),
      entry({ key: 'empty', originalText: 'x', translatedText: '', status: 'missing' }),
    ]),
  ])

  it('first occurrence of a key wins', () => {
    expect(ref.get('a')?.translatedText).toBe('Привет')
  })

  it('fills same text, flags changed text as outdated, ignores unknown keys', () => {
    expect(matchEntry(entry({ key: 'a', originalText: 'Hello' }), ref)).toMatchObject({ status: 'translated', translatedText: 'Привет' })
    expect(matchEntry(entry({ key: 'a', originalText: 'Hello!' }), ref)).toMatchObject({
      status: 'outdated',
      previousOriginalText: 'Hello',
    })
    expect(matchEntry(entry({ key: 'zzz', originalText: 'q' }), ref).status).toBe('missing')
    expect(matchEntry(entry({ key: 'empty', originalText: 'x' }), ref).status).toBe('missing')
  })
})

describe('textDiff', () => {
  it('handles identical, empty and fully different inputs', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ type: 'same', text: 'same text' }])
    expect(diffWords('', 'new')).toEqual([{ type: 'add', text: 'new' }])
    expect(diffWords('old', '')).toEqual([{ type: 'del', text: 'old' }])
    expect(similarity('', 'x')).toBe(0)
  })

  it('falls back gracefully on very large inputs', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ')
    const b = Array.from({ length: 3000 }, (_, i) => `w${i % 2990}`).join(' ')
    expect(diffWords(a, b).length).toBeGreaterThan(0)
    const s = similarity(a, b)
    expect(s).toBeGreaterThan(0.5)
    expect(s).toBeLessThanOrEqual(1)
  })
})

describe('applyTranslations', () => {
  it('only touches entries that received a translation', () => {
    const entries = [entry({ key: 'a' }), entry({ key: 'b', translatedText: 'keep', status: 'approved' })]
    const out = applyTranslations(entries, new Map([['a', 'Новый']]))
    expect(out[0]).toMatchObject({ translatedText: 'Новый', status: 'translated' })
    expect(out[1]).toBe(entries[1])
  })
})

describe('estimate', () => {
  it('sums estimates and computes cost from per-million prices', () => {
    const a = { entriesToTranslate: 1, entriesFree: 2, requests: 3, inputTokens: 1_000_000, outputTokens: 500_000 }
    const sum = sumEstimates([a, a])
    expect(sum).toEqual({ entriesToTranslate: 2, entriesFree: 4, requests: 6, inputTokens: 2_000_000, outputTokens: 1_000_000 })
    expect(estimateCost(a, 0.3, 2.5)).toBeCloseTo(0.3 + 1.25)
  })

  it('is zero when everything is already translated', () => {
    const e = estimateRun([entry({ key: 'a', translatedText: 'x', status: 'translated' })], 'P', {})
    expect(e).toMatchObject({ requests: 0, entriesToTranslate: 0, entriesFree: 0 })
  })

  it('grows with the number of chunks', () => {
    const many = Array.from({ length: 40 }, (_, i) => entry({ key: `k${i}`, originalText: `Sentence number ${i} to translate` }))
    const small = estimateRun(many, 'P', { maxChunkChars: 300 })
    const big = estimateRun(many, 'P', { maxChunkChars: 100000 })
    expect(small.requests).toBeGreaterThan(big.requests)
    expect(small.inputTokens).toBeGreaterThan(big.inputTokens)
  })
})

describe('buildVanillaPairs', () => {
  const stellaris = getGameProfile('stellaris')
  const ck3 = getGameProfile('ck3')
  const f = (text: string) => new File([text], 'x.yml')

  it('pairs EN and RU by key, skipping trivial, broken-token and version-mismatched strings', async () => {
    const en = new Map([['en.yml', f('l_english:\n a:0 "Energy"\n b:0 "$X$"\n c:0 "Cost $N$"\n d:1 "Alloys"\n e:0 "Only EN"\n')]])
    const ru = new Map([['ru.yml', f('l_russian:\n a:0 "Энергия"\n b:0 "$X$"\n c:0 "Цена"\n d:0 "Сплавы"\n')]])
    const pairs = await buildVanillaPairs(en, ru, stellaris)
    expect([...pairs]).toEqual([['Energy', 'Энергия']])
  })

  it('works with CK3 syntax and reports progress', async () => {
    const en = new Map([['en.yml', f('l_english:\n duke: "Duke"\n')]])
    const ru = new Map([['ru.yml', f('l_russian:\n duke: "Герцог"\n')]])
    const seen: number[] = []
    const pairs = await buildVanillaPairs(en, ru, ck3, (done) => seen.push(done))
    expect(pairs.get('Duke')).toBe('Герцог')
    expect(seen).toEqual([1, 2])
  })

  it('survives unreadable files', async () => {
    const bad = { text: () => Promise.reject(new Error('nope')) } as unknown as File
    const pairs = await buildVanillaPairs(new Map([['a', bad]]), new Map([['b', bad]]), stellaris)
    expect(pairs.size).toBe(0)
  })
})

describe('GeminiError.from', () => {
  it('unwraps the SDK JSON body', () => {
    const e = GeminiError.from(new Error(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } })))
    expect(e).toMatchObject({ code: 503, status: 'UNAVAILABLE', message: 'overloaded' })
    expect(e.isRetryable).toBe(true)
    expect(e.userMessage).toContain('перегружена')
  })

  it('unwraps doubly nested bodies', () => {
    const inner = JSON.stringify({ error: { code: 429, message: 'quota', details: [{ retryDelay: '5s' }] } })
    const e = GeminiError.from(new Error(JSON.stringify({ error: { code: 400, message: inner } })))
    expect(e.code).toBe(429)
    expect(e.message).toBe('quota')
  })

  it('handles plain errors, strings and existing GeminiErrors', () => {
    expect(GeminiError.from(new Error('boom')).message).toBe('boom')
    expect(GeminiError.from('text').message).toBe('text')
    const g = new GeminiError('x', 401, 'UNAUTH')
    expect(GeminiError.from(g)).toBe(g)
    expect(g.isRetryable).toBe(false)
    expect(g.userMessage).toContain('ключ')
  })
})

describe('GeminiRateLimiter.handle429', () => {
  const limiter = new GeminiRateLimiter()

  it('retries short per-minute limits, including fractional delays', () => {
    expect(limiter.handle429([{ retryDelay: '30s' }])).toEqual({ action: 'retry', waitSeconds: 30 })
    expect(limiter.handle429([{ retryDelay: '3.2s' }])).toEqual({ action: 'retry', waitSeconds: 4 })
  })

  it('treats a missing or very long delay as the daily limit', () => {
    expect(limiter.handle429([])).toEqual({ action: 'abort', reason: 'daily_limit' })
    expect(limiter.handle429([{ retryDelay: '3600s' }])).toEqual({ action: 'abort', reason: 'daily_limit' })
  })
})

describe('ApiKeyPool', () => {
  it('rejects an empty pool and ignores blank keys', () => {
    expect(() => new ApiKeyPool(['', '  '])).toThrow()
    expect(new ApiKeyPool(['a', ' ', 'b']).totalCount).toBe(2)
  })

  it('rotates round-robin and skips exhausted keys', () => {
    const pool = new ApiKeyPool(['a', 'b', 'c'])
    expect(pool.currentKey).toBe('a')
    pool.rotateNext()
    expect(pool.currentKey).toBe('b')
    expect(pool.exhaustCurrent()).toBe(true)
    expect(pool.currentKey).toBe('c')
    pool.rotateNext()
    expect(pool.currentKey).toBe('a')
    expect(pool.isExhausted(1)).toBe(true)
    expect(pool.availableCount).toBe(2)
  })

  it('reports when every key is exhausted', () => {
    const pool = new ApiKeyPool(['a', 'b'])
    expect(pool.exhaustCurrent()).toBe(true)
    expect(pool.exhaustCurrent()).toBe(false)
    expect(pool.rotateNext()).toBe(false)
  })
})
