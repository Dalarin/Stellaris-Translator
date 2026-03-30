import { useState, useCallback, useMemo } from 'react'
import type { TranslationFile, TranslationEntry } from '@/types'

export interface SearchOptions {
  query: string
  searchIn: 'all' | 'keys' | 'original' | 'translation'
  statusFilter: 'all' | 'translated' | 'outdated' | 'missing'
}

export interface SearchResult {
  fileId: string
  filePath: string
  entry: TranslationEntry
  matchField: 'key' | 'original' | 'translation'
}

const MAX_RESULTS = 300

export function useSearch(files: TranslationFile[]) {
  const [options, setOptions] = useState<SearchOptions>({
    query: '',
    searchIn: 'all',
    statusFilter: 'all',
  })

  const results = useMemo((): SearchResult[] => {
    const q = options.query.toLowerCase().trim()
    if (!q) return []

    const out: SearchResult[] = []

    for (const file of files) {
      if (out.length >= MAX_RESULTS) break
      for (const entry of file.entries) {
        if (out.length >= MAX_RESULTS) break

        if (options.statusFilter !== 'all' && entry.status !== options.statusFilter) continue

        const matchKey =
          (options.searchIn === 'all' || options.searchIn === 'keys') &&
          entry.key.toLowerCase().includes(q)

        const matchOriginal =
          (options.searchIn === 'all' || options.searchIn === 'original') &&
          entry.originalText.toLowerCase().includes(q)

        const matchTranslation =
          (options.searchIn === 'all' || options.searchIn === 'translation') &&
          entry.translatedText.toLowerCase().includes(q)

        if (matchKey) {
          out.push({ fileId: file.id, filePath: file.relativePath, entry, matchField: 'key' })
        } else if (matchOriginal) {
          out.push({ fileId: file.id, filePath: file.relativePath, entry, matchField: 'original' })
        } else if (matchTranslation) {
          out.push({ fileId: file.id, filePath: file.relativePath, entry, matchField: 'translation' })
        }
      }
    }

    return out
  }, [files, options])

  const setQuery = useCallback((query: string) => {
    setOptions((prev) => ({ ...prev, query }))
  }, [])

  const setSearchIn = useCallback((searchIn: SearchOptions['searchIn']) => {
    setOptions((prev) => ({ ...prev, searchIn }))
  }, [])

  const setStatusFilter = useCallback((statusFilter: SearchOptions['statusFilter']) => {
    setOptions((prev) => ({ ...prev, statusFilter }))
  }, [])

  return { options, results, setQuery, setSearchIn, setStatusFilter }
}

export function highlightMatch(text: string, query: string): { before: string; match: string; after: string } | null {
  if (!query) return null
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return null
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + query.length),
    after: text.slice(idx + query.length),
  }
}
