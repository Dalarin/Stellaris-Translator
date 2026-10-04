import React from 'react'

export interface ColorSegment {
  text: string
  color: string | null
  bold?: boolean
}

/** Renders styled segments; the segmentation itself is game specific (see src/games). */
export function renderSegments(segments: ColorSegment[]): React.ReactNode[] {
  return segments.map((seg, i) =>
    React.createElement(
      'span',
      {
        key: i,
        style: seg.color || seg.bold
          ? { color: seg.color ?? undefined, fontWeight: seg.bold ? 700 : undefined }
          : undefined,
      },
      seg.text,
    ),
  )
}
