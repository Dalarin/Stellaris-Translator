import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DB_NAME = 'StellarisTlDB'

/** Fresh module graph + empty database for every test. */
async function freshOps() {
  vi.resetModules()
  const ops = await import('@/db/operations')
  const { db } = await import('@/db/schema')
  return { ops, db }
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})

afterEach(async () => {
  vi.resetModules()
  await Dexie.delete(DB_NAME)
})

describe('schema migrations', () => {
  it('v2 splits keys that had the index glued on', async () => {
    const legacy = new Dexie(DB_NAME)
    legacy.version(1).stores({
      projects: '&id, name, createdAt, updatedAt',
      translationFiles: '&id, projectId, relativePath, [projectId+relativePath]',
      glossaryEntries: '&id, projectId, sourceTerm',
      meta: '&key',
    })
    await legacy.table('translationFiles').put({
      id: 'f1',
      projectId: 'p1',
      relativePath: 'a.yml',
      language: 'english',
      entries: [
        { key: 'ev.1.a:0', index: null, originalText: 'x', translatedText: '', category: null, status: 'missing' },
        { key: 'plain', index: null, originalText: 'y', translatedText: '', category: null, status: 'missing' },
        { key: 'already', index: 3, originalText: 'z', translatedText: '', category: null, status: 'missing' },
        { key: 'with:colon', index: null, originalText: 'w', translatedText: '', category: null, status: 'missing' },
      ],
    })
    legacy.close()

    const { db } = await freshOps()
    const file = await db.translationFiles.get('f1')
    expect(file!.entries.map((e) => [e.key, e.index])).toEqual([
      ['ev.1.a', 0],
      ['plain', null],
      ['already', 3],
      ['with:colon', null],
    ])
  })

  it('v4 moves the Stellaris-only vanilla table into the per-game table', async () => {
    const v3 = new Dexie(DB_NAME)
    v3.version(3).stores({
      projects: '&id, name, createdAt, updatedAt',
      translationFiles: '&id, projectId, relativePath, [projectId+relativePath]',
      glossaryEntries: '&id, projectId, sourceTerm',
      meta: '&key',
      vanillaMemory: '&text',
    })
    await v3.table('vanillaMemory').bulkPut([
      { text: 'Energy', translation: 'Энергия' },
      { text: 'Minerals', translation: 'Минералы' },
    ])
    v3.close()

    const { ops, db } = await freshOps()
    const memory = await ops.getVanillaMemory('stellaris')
    expect([...memory].sort()).toEqual([['Energy', 'Энергия'], ['Minerals', 'Минералы']])
    expect(await ops.getVanillaMemoryCount('ck3')).toBe(0)
    expect(db.tables.map((t) => t.name)).not.toContain('vanillaMemory')
  })
})

describe('projects', () => {
  it('stores the game and defaults to Stellaris', async () => {
    const { ops } = await freshOps()
    const a = await ops.createProject('A', 'a')
    const b = await ops.createProject('B', 'b', 'ck3')
    expect(a.game).toBe('stellaris')
    expect(b.game).toBe('ck3')
    const stored = await ops.getProjects()
    expect(stored.find((p) => p.id === 'b')?.game).toBe('ck3')
  })

  it('deleting a project removes its files and glossary', async () => {
    const { ops } = await freshOps()
    await ops.createProject('A', 'a')
    await ops.upsertTranslationFile({ id: 'f', projectId: 'a', relativePath: 'x.yml', language: 'english', entries: [] })
    await ops.upsertGlossaryEntries([{ id: 'g', projectId: 'a', sourceTerm: 'x', targetTerm: 'y' }])
    await ops.deleteProject('a')
    expect(await ops.getFilesForProject('a')).toEqual([])
    expect(await ops.getGlossaryForProject('a')).toEqual([])
  })

  it('deleteTranslationFiles and getTranslationFile', async () => {
    const { ops } = await freshOps()
    const file = { id: 'f', projectId: 'a', relativePath: 'x.yml', language: 'english', entries: [] }
    await ops.upsertTranslationFile(file)
    expect((await ops.getTranslationFile('f'))?.relativePath).toBe('x.yml')
    await ops.deleteTranslationFiles(['f'])
    expect(await ops.getTranslationFile('f')).toBeUndefined()
  })
})

describe('vanilla memory per game', () => {
  it('keeps games separate and replaces only the chosen game', async () => {
    const { ops } = await freshOps()
    await ops.replaceVanillaMemory('stellaris', new Map([['Energy', 'Энергия']]))
    await ops.replaceVanillaMemory('ck3', new Map([['Energy', 'Сила'], ['Duke', 'Герцог']]))
    expect((await ops.getVanillaMemory('stellaris')).get('Energy')).toBe('Энергия')
    expect((await ops.getVanillaMemory('ck3')).get('Energy')).toBe('Сила')
    expect(await ops.getVanillaMemoryCount('ck3')).toBe(2)

    await ops.replaceVanillaMemory('ck3', new Map([['Count', 'Граф']]))
    expect([...(await ops.getVanillaMemory('ck3')).keys()]).toEqual(['Count'])
    expect(await ops.getVanillaMemoryCount('stellaris')).toBe(1)
  })
})

describe('settings', () => {
  it('returns defaults, then stored translate settings', async () => {
    const { ops } = await freshOps()
    const defaults = await ops.getProjectTranslateSettings('p')
    expect(defaults).toMatchObject({ thinking: 'medium', temperature: null, concurrency: 3 })
    await ops.setProjectTranslateSettings('p', { ...defaults, chunkChars: 5000, temperature: 0.7 })
    expect(await ops.getProjectTranslateSettings('p')).toMatchObject({ chunkChars: 5000, temperature: 0.7 })
  })

  it('reads the legacy chunk-size key', async () => {
    const { ops, db } = await freshOps()
    await db.meta.put({ key: 'chunkChars_p', value: '9000' })
    expect((await ops.getProjectTranslateSettings('p')).chunkChars).toBe(9000)
  })

  it('upgrades an untouched legacy prompt but keeps custom prompts', async () => {
    const { ops } = await freshOps()
    const { stellarisProfile } = await import('@/games/stellaris')
    await ops.setProjectGeminiPrompt('p1', stellarisProfile.legacyPrompts[0])
    expect(await ops.getProjectGeminiPrompt('p1')).toBeNull()
    await ops.setProjectGeminiPrompt('p2', 'my own prompt')
    expect(await ops.getProjectGeminiPrompt('p2')).toBe('my own prompt')
    expect(await ops.getProjectGeminiPrompt('missing')).toBeNull()
  })

  it('stores Gemini settings, free keys and bulk prices', async () => {
    const { ops } = await freshOps()
    expect(await ops.getGeminiSettings()).toBeNull()
    await ops.setGeminiSettings('key', 'gemini-3.8-flash')
    await ops.setFreeApiKeys(['a', 'b'])
    expect(await ops.getGeminiSettings()).toMatchObject({ apiKey: 'key', model: 'gemini-3.8-flash', freeApiKeys: ['a', 'b'] })
    await ops.setBulkPrices({ input: '0.3', output: '2.5' })
    expect(await ops.getBulkPrices()).toEqual({ input: '0.3', output: '2.5' })
  })
})
