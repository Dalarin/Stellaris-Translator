export type EntryStatus = 'translated' | 'approved' | 'outdated' | 'missing'

export type StatusFilter = 'all' | EntryStatus

export interface TranslationEntry {
  key: string
  index: number | null
  originalText: string
  translatedText: string
  category: string | null
  status: EntryStatus
  /** English text the current translation was made for; set when status is 'outdated' */
  previousOriginalText?: string
  /** Outdated, but the English text changed only slightly — usually a quick touch-up of the translation */
  minorChange?: boolean
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
  /** Absent = accepted (legacy entries). 'suggested' comes from the AI and awaits review. */
  status?: GlossaryStatus
}

export type GlossaryStatus = 'accepted' | 'suggested' | 'rejected'

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

export type ThinkingSetting = 'default' | 'minimal' | 'low' | 'medium' | 'high'

/** Per-project knobs for the paid Gemini translation run */
export interface TranslateSettings {
  chunkChars: number
  thinking: ThinkingSetting
  /** null = model default */
  temperature: number | null
  /** parallel requests (paid API) */
  concurrency: number
}
