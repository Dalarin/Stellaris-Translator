export type EntryStatus = 'translated' | 'approved' | 'outdated' | 'missing'

export type StatusFilter = 'all' | EntryStatus

export interface TranslationEntry {
  key: string
  index: number | null
  originalText: string
  translatedText: string
  category: string | null
  status: EntryStatus
}

export interface TranslationFile {
  id: string
  projectId: string
  relativePath: string
  language: string
  entries: TranslationEntry[]
}

export interface Project {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface GlossaryEntry {
  id: string
  projectId: string
  sourceTerm: string
  targetTerm: string
}

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
  fileId?: string
  stats?: FileStats
}

export interface FileStats {
  approved: number
  translated: number
  outdated: number
  missing: number
  total: number
}
