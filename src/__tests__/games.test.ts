import { describe, expect, it } from 'vitest'
import { GAMES, getGameProfile } from '@/games'
import { buildChunks, formatChunk, parseResponse } from '@/services/chunking'
import { extractTokens, isTrivial, splitValid, tokensMatch } from '@/services/translationPrep'
import { checkEntries } from '@/utils/qaChecks'
import { parseLoc } from '@/parser/locParser'
import type { TranslationEntry, TranslationFile } from '@/types'

const ck3 = getGameProfile('ck3')
const stellaris = getGameProfile('stellaris')

const entry = (over: Partial<TranslationEntry> & { key: string }): TranslationEntry => ({
  index: null,
  originalText: 'Text',
  translatedText: '',
  category: null,
  status: 'missing',
  ...over,
})

const CK3_FILE = `﻿l_english:
 # a comment
 my_event.0001.t: "A Strange Visitor"
 my_event.0001.desc: "[ROOT.Char.GetFirstName] meets #bold a stranger#! at the gate.\\n$VALUE|=+0$ gold @gold_icon!"
 my_event.0001.a: "Welcome them"
 trait_brave: "He said "charge" and she did" # trailing comment with "quotes"
 versioned:1 "Old style"
`

describe('game registry', () => {
  it('has Stellaris and CK3 profiles and falls back to Stellaris', () => {
    expect(GAMES.map((g) => g.id).sort()).toEqual(['ck3', 'stellaris'])
    expect(getGameProfile(undefined).id).toBe('stellaris')
    expect(getGameProfile(null).id).toBe('stellaris')
    expect(ck3.locFolder).toBe('localization')
    expect(stellaris.locFolder).toBe('localisation')
  })

  it('gives each game its own default prompt', () => {
    expect(ck3.defaultPrompt).toContain('Crusader Kings III')
    expect(stellaris.defaultPrompt).toContain('Stellaris')
    expect(ck3.defaultPrompt).not.toContain('§')
  })
})

describe('CK3 files', () => {
  const { entries, language } = parseLoc(CK3_FILE)

  it('parses unversioned and versioned entries', () => {
    expect(language).toBe('english')
    expect(entries.map((e) => [e.key, e.index])).toEqual([
      ['my_event.0001.t', null],
      ['my_event.0001.desc', null],
      ['my_event.0001.a', null],
      ['trait_brave', null],
      ['versioned', 1],
    ])
  })

  it('keeps unescaped quotes inside a value and ignores trailing comments', () => {
    expect(entries[3].originalText).toBe('He said "charge" and she did')
  })

  it('round-trips through the CK3 serializer', () => {
    const file: TranslationFile = {
      id: 'f', projectId: 'p', relativePath: 'localization/english/ev_l_english.yml', language,
      entries: entries.map((e) => ({ ...e, translatedText: e.originalText, status: 'translated' as const })),
    }
    const out = ck3.serialize(file, 'russian')
    expect(out).toContain('l_russian:')
    expect(out).toContain(' my_event.0001.t: "A Strange Visitor"')
    expect(out).toContain(' versioned:1 "Old style"')
    expect(out).toContain('"He said \\"charge\\" and she did"')
    expect(parseLoc(out).entries.map((e) => e.originalText)).toEqual(entries.map((e) => e.originalText))
  })

  it('maps export paths to the russian folder and file name', () => {
    expect(ck3.exportPath('localization/english/replace/ev_l_english.yml', 'english', 'russian')).toBe(
      'localization/russian/replace/ev_l_russian.yml',
    )
  })
})

describe('CK3 tokens', () => {
  const text = entries0()

  function entries0(): string {
    return parseLoc(CK3_FILE).entries[1].originalText
  }

  it('pins formats, scripted calls, variables and icons', () => {
    expect(extractTokens(text, ck3)).toEqual(
      ['#!', '#bold', '$VALUE|=+0$', '@gold_icon!', '[ROOT.Char.GetFirstName]', '\\n'].sort(),
    )
  })

  it('accepts a faithful translation and rejects a broken one', () => {
    const ok = '[ROOT.Char.GetFirstName] встречает #bold незнакомца#! у ворот.\\n$VALUE|=+0$ золота @gold_icon!'
    const broken = '[ROOT.Char.GetFirstName] встречает незнакомца у ворот.\\n$VALUE|=+0$ золота'
    expect(tokensMatch(text, ok, ck3)).toBe(true)
    expect(tokensMatch(text, broken, ck3)).toBe(false)
  })

  it('pins only the opening of scripted calls with quoted arguments', () => {
    const orig = "Gain [GetTrait('brave').GetName] now"
    expect(tokensMatch(orig, "Получите [GetTrait('brave').GetName] сейчас", ck3)).toBe(true)
    expect(tokensMatch(orig, 'Получите черту сейчас', ck3)).toBe(false)
  })

  it('does not treat Stellaris codes as CK3 tokens and vice versa', () => {
    expect(extractTokens('§YGold§!', ck3)).toEqual([])
    expect(extractTokens('#P Good#!', stellaris)).toEqual([])
    expect(isTrivial('#bold $VALUE$#!', ck3)).toBe(true)
  })

  it('validates model output per game', () => {
    const chunk = [entry({ key: 'a', originalText: '#P +5#! speed' })]
    const lost = splitValid(chunk, new Map([['a', '+5 скорости']]), ck3)
    expect(lost.invalidKeys).toEqual(['a'])
    const kept = splitValid(chunk, new Map([['a', '#P +5#! скорости']]), ck3)
    expect([...kept.valid.keys()]).toEqual(['a'])
  })
})

describe('CK3 formatting preview', () => {
  it('styles #formats and consumes the code and its space', () => {
    expect(ck3.colorSegments('A #bold strong#! word and #P good#!')).toEqual([
      { text: 'A ', color: null, bold: undefined },
      { text: 'strong', color: null, bold: true },
      { text: ' word and ', color: null, bold: undefined },
      { text: 'good', color: '#6FBF5A', bold: undefined },
    ])
    expect(ck3.stripFormatting('#bold Brave#! $X$')).toBe('Brave $X$')
  })

  it('keeps Stellaris § colors working', () => {
    expect(stellaris.colorSegments('A §YGold§! b')).toEqual([
      { text: 'A ', color: null },
      { text: 'Gold', color: '#FFD700' },
      { text: ' b', color: null },
    ])
  })
})

describe('prompt syntax for the model', () => {
  it('shows unversioned keys with a colon and parses answers in either style', () => {
    const [chunk] = buildChunks([entry({ key: 'ev.t', originalText: 'Title' }), entry({ key: 'ev.v', index: 2, originalText: 'Old' })])
    const text = formatChunk(chunk)
    expect(text).toContain(' ev.t: "Title"')
    expect(text).toContain(' ev.v:2 "Old"')
    const got = parseResponse(' ev.t: "Заголовок"\n ev.v:2 "Старый"\n', new Set(['ev.t', 'ev.v']))
    expect([...got]).toEqual([['ev.t', 'Заголовок'], ['ev.v', 'Старый']])
  })
})

describe('CK3 QA', () => {
  it('reports lost formatting tokens', () => {
    const issues = checkEntries(
      [entry({ key: 'a', originalText: '#bold Brave#! man', translatedText: 'Храбрый человек', status: 'translated' })],
      [],
      ck3,
    )
    expect(issues.map((i) => i.kind)).toEqual(['tokens'])
  })
})
