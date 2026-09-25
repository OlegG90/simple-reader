export type Flow = 'paginated' | 'scrolled'

/** Margin on each side of the text (and between columns), as a share of the window width. */
const SIDE_MARGIN = 0.03

/**
 * The paginator's `gap` attribute. The paginator leaves about this much on
 * each side of the text, whether paginated or scrolled, and between columns.
 */
export const PAGE_GAP = `${SIDE_MARGIN * 100}%`

/** Wider than any window: one column (or scrolled text) runs to the margins. */
const FILL_PX = 100_000

interface ColumnLayout {
  /** The paginator's `max-column-count`. */
  columns: number
  /** The paginator's `max-inline-size`, in px. */
  maxInlineSize: number
}

/**
 * How the text fills the viewport. Scrolled text spans the whole width.
 * Paginated text is one column across the viewport, or two side by side when
 * one column would be longer than the reader's line length (`lineWidth`).
 *
 * The paginator uses min(max-column-count, ceil(width / max-inline-size))
 * columns, together max-inline-size × columns wide. So one column fills the
 * viewport with any huge max-inline-size, and two with any value in
 * [width / 2, width). `current` is kept while it still fits, so resizing the
 * window doesn't change the attribute (each change re-lays the book out).
 */
export function columnLayout(
  viewport: { width: number; height: number },
  lineWidth: number,
  flow: Flow,
  current?: number,
): ColumnLayout {
  const { width, height } = viewport
  // Taller than wide: the paginator allows one column only (its
  // `@container (orientation: portrait)` rule), so don't ask for two.
  const twoColumns = flow === 'paginated' && height < width && width * (1 - 2 * SIDE_MARGIN) > lineWidth
  if (!twoColumns) return { columns: 1, maxInlineSize: FILL_PX }
  const fits = current !== undefined && current >= width / 2 && current < width
  // A value in the middle of the range fits widths from about 0.75× to 1.5× this one.
  return { columns: 2, maxInlineSize: fits ? current : Math.floor(width * 0.75) }
}
