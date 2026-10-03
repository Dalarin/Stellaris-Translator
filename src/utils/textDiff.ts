export interface DiffPart {
  type: 'same' | 'del' | 'add'
  text: string
}

/** Words and the whitespace between them are separate tokens, so diffs re-join losslessly. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t !== '')
}

const MAX_CELLS = 2_500_000

/** LCS table over tokens; null when the inputs are too large for a cheap exact diff. */
function lcsTable(a: string[], b: string[]): Int32Array | null {
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return null
  const w = b.length + 1
  const t = new Int32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i * w + j] =
        a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1])
    }
  }
  return t
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const table = lcsTable(a, b)
  if (!table) {
    return [
      { type: 'del', text: before },
      { type: 'add', text: after },
    ]
  }

  const w = b.length + 1
  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string): void => {
    const last = parts[parts.length - 1]
    if (last && last.type === type) last.text += text
    else parts.push({ type, text })
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++ }
    else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) { push('del', a[i]); i++ }
    else { push('add', b[j]); j++ }
  }
  while (i < a.length) push('del', a[i++])
  while (j < b.length) push('add', b[j++])
  return parts
}

/** 0..1 — share of words kept between the two texts (Dice coefficient over the word LCS). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const wa = a.split(/\s+/).filter(Boolean)
  const wb = b.split(/\s+/).filter(Boolean)
  if (wa.length === 0 || wb.length === 0) return 0
  const table = lcsTable(wa, wb)
  if (!table) {
    const setB = new Set(wb)
    const common = wa.filter((x) => setB.has(x)).length
    return (2 * common) / (wa.length + wb.length)
  }
  return (2 * table[0]) / (wa.length + wb.length)
}
