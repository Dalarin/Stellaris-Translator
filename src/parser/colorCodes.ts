import React from 'react'

export const COLOR_MAP: Record<string, string | null> = {
  Y: '#FFD700',
  R: '#E05050',
  G: '#50E050',
  B: '#6080FF',
  W: '#FFFFFF',
  H: '#FFD700',
  T: '#40E0D0',
  P: '#C060FF',
  L: '#80FFFF',
  '!': null, // reset
}

export interface ColorSegment {
  text: string
  color: string | null
}

export function parseColorSegments(text: string): ColorSegment[] {
  const segments: ColorSegment[] = []
  const parts = text.split(/§(.)/)
  let currentColor: string | null = null

  // parts alternates: [text, code, text, code, ...]
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // text segment
      if (parts[i]) {
        segments.push({ text: parts[i], color: currentColor })
      }
    } else {
      // color code
      const code = parts[i]
      if (code in COLOR_MAP) {
        currentColor = COLOR_MAP[code]
      }
    }
  }

  return segments
}

export function renderColorCodes(text: string): React.ReactNode[] {
  const segments = parseColorSegments(text)
  return segments.map((seg, i) =>
    React.createElement(
      'span',
      {
        key: i,
        style: seg.color ? { color: seg.color } : undefined,
      },
      seg.text
    )
  )
}

export function stripColorCodes(text: string): string {
  return text.replace(/§./g, '')
}
