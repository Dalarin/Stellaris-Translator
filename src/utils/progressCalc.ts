import type { TranslationFile, TranslationEntry, FileStats } from '@/types'

export function calcFileStats(file: TranslationFile): FileStats {
  const stats: FileStats = { translated: 0, outdated: 0, missing: 0, total: 0 }
  for (const entry of file.entries) {
    stats.total++
    stats[entry.status]++
  }
  return stats
}

export function calcTotalStats(files: TranslationFile[]): FileStats {
  const stats: FileStats = { translated: 0, outdated: 0, missing: 0, total: 0 }
  for (const file of files) {
    const s = calcFileStats(file)
    stats.translated += s.translated
    stats.outdated += s.outdated
    stats.missing += s.missing
    stats.total += s.total
  }
  return stats
}

export function calcProgress(stats: FileStats): number {
  if (stats.total === 0) return 0
  return Math.round((stats.translated / stats.total) * 100)
}

export function getStatusColor(stats: FileStats): string {
  const pct = calcProgress(stats)
  if (pct >= 80) return 'text-green-400'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

export function filterEntries(
  entries: TranslationEntry[],
  filter: 'all' | 'translated' | 'outdated' | 'missing'
): TranslationEntry[] {
  if (filter === 'all') return entries
  return entries.filter((e) => e.status === filter)
}
