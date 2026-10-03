import Dexie, { type Table } from 'dexie'
import type { Project, TranslationFile, GlossaryEntry } from '@/types'

interface MetaRecord {
  key: string
  value: string
}

interface VanillaMemoryRecord {
  text: string
  translation: string
}

class StellarisTlDB extends Dexie {
  projects!: Table<Project, string>
  translationFiles!: Table<TranslationFile, string>
  glossaryEntries!: Table<GlossaryEntry, string>
  meta!: Table<MetaRecord, string>
  vanillaMemory!: Table<VanillaMemoryRecord, string>

  constructor() {
    super('StellarisTlDB')
    this.version(1).stores({
      projects: '&id, name, createdAt, updatedAt',
      translationFiles: '&id, projectId, relativePath, [projectId+relativePath]',
      glossaryEntries: '&id, projectId, sourceTerm',
      meta: '&key',
    })
    // v1 parser glued the index to the key ("KEY:0", index null). Split them.
    this.version(2)
      .stores({
        projects: '&id, name, createdAt, updatedAt',
        translationFiles: '&id, projectId, relativePath, [projectId+relativePath]',
        glossaryEntries: '&id, projectId, sourceTerm',
        meta: '&key',
      })
      .upgrade((tx) =>
        tx.table('translationFiles').toCollection().modify((file: TranslationFile) => {
          for (const entry of file.entries) {
            if (entry.index !== null && entry.index !== undefined) continue
            const m = entry.key.match(/^(.+):(\d+)$/)
            if (m) {
              entry.key = m[1]
              entry.index = parseInt(m[2], 10)
            }
          }
        }),
      )
    // v3: official vanilla translations used as translation memory (exact English text → RU)
    this.version(3).stores({
      projects: '&id, name, createdAt, updatedAt',
      translationFiles: '&id, projectId, relativePath, [projectId+relativePath]',
      glossaryEntries: '&id, projectId, sourceTerm',
      meta: '&key',
      vanillaMemory: '&text',
    })
  }
}

export const db = new StellarisTlDB()
