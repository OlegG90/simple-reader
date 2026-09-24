/** Where the reader is within the current chapter, as foliate-js's paginator reports it. */
export interface ChapterLayout {
  /** The paginator's current screen (`renderer.page`). */
  page: number
  /** The paginator's screen count (`renderer.pages`), which includes a blank screen before and after the text. */
  pages: number
  /** Columns side by side on one screen. */
  columns: number
  /** Columns that actually hold text, if measured (the last screen may be half empty). */
  textColumns?: number
}

/**
 * The page label under each column on screen, e.g. `['5 / 18', '6 / 18']`
 * for a two-column spread. A column past the end of the chapter gets ''.
 */
export function pageLabels({ page, pages, columns, textColumns }: ChapterLayout): string[] {
  // Screens 1..pages-2 hold text; 0 and pages-1 are the paginator's blank edges.
  const screens = pages - 2
  const onText = page >= 1 && page <= screens
  const total = Math.min(textColumns ?? Infinity, screens * columns)
  const first = (page - 1) * columns + 1
  return Array.from({ length: columns }, (_, i) => (onText && first + i <= total ? `${first + i} / ${total}` : ''))
}
