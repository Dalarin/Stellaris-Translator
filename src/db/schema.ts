import Dexie, { type Table } from 'dexie'
import type { Project, TranslationFile, GlossaryEntry } from '@/types'

interface MetaRecord {
  key: string
  value: string
}

class StellarisTlDB extends Dexie {
  projects!: Table<Project, string>
  translationFiles!: Table<TranslationFile, string>
  glossaryEntries!: Table<GlossaryEntry, string>
  meta!: Table<MetaRecord, string>

  constructor() {
    super('StellarisTlDB')
    this.version(1).stores({
      projects: '&id, name, createdAt, updatedAt',
      translationFiles: '&id, projectId, relativePath, [projectId+relativePath]',
      glossaryEntries: '&id, projectId, sourceTerm',
      meta: '&key',
    })
  }
}

export const db = new StellarisTlDB()
