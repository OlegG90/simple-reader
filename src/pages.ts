/** Where the reader is within the current chapter, in the paginator's terms. */
export interface ChapterLayout {
  /** The renderer's current screen, 1-based (0 and `screens + 1` are its blank edges). */
  screen: number
  /** Screens of text in the chapter. */
  screens: number
  /** Columns side by side on one screen. */
  columns: number
  /** Columns that actually hold text, if measured (the last screen may be half empty). */
  textColumns?: number
}

/**
 * The page label under each column on screen, e.g. `['5 / 18', '6 / 18']`
 * for a two-column spread. A column past the end of the chapter gets ''.
 */
export function pageLabels({ screen, screens, columns, textColumns }: ChapterLayout): string[] {
  if (screens < 1 || columns < 1 || screen < 1 || screen > screens) return Array(Math.max(columns, 0)).fill('')
  const total = Math.min(textColumns ?? Infinity, screens * columns)
  const first = (screen - 1) * columns + 1
  return Array.from({ length: columns }, (_, i) => (first + i <= total ? `${first + i} / ${total}` : ''))
}
