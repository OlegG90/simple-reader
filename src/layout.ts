export type Flow = 'paginated' | 'scrolled'

/** Margin on each side of the text (and between columns), as a share of the window width. */
export const SIDE_MARGIN = 0.03

/**
 * The paginator's `gap` attribute. The paginator leaves about this much on
 * each side of the text, whether paginated or scrolled, and between columns.
 */
export const PAGE_GAP = `${SIDE_MARGIN * 100}%`

/** Wider than any window, so scrolled text always runs to the margins. */
const FILL_PX = 100_000

export interface ColumnLayout {
  /** The paginator's `max-column-count`. */
  columns: number
  /** The paginator's `max-inline-size`, in px. */
  maxInlineSize: number
}

/**
 * How the text fills the viewport. Scrolled text spans the whole width.
 * Paginated text is one column across the viewport, or two side by side when
 * one column would be longer than the reader's line length (`lineWidth`).
 * A viewport taller than wide always gets one column: the paginator allows
 * no more there.
 */
export function columnLayout(viewport: { width: number; height: number }, lineWidth: number, flow: Flow): ColumnLayout {
  if (flow === 'scrolled') return { columns: 1, maxInlineSize: FILL_PX }
  const { width, height } = viewport
  const singleColumn = width * (1 - 2 * SIDE_MARGIN)
  const columns = height < width && singleColumn > lineWidth ? 2 : 1
  // The paginator uses min(max-column-count, ceil(width / max-inline-size))
  // columns; just under width / columns gives exactly `columns`, filling the viewport.
  return { columns, maxInlineSize: Math.floor(width / columns) - 1 }
}
