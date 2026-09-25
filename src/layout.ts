import type { Flow } from './reader'

/** Margin on each side of the text, as a share of the window width. */
export const SIDE_MARGIN = 0.03

/**
 * The paginator's `gap` attribute: half of it becomes the margin on each
 * side, the rest the space between columns.
 */
export const PAGE_GAP = `${SIDE_MARGIN * 2 * 100}%`

/** Wider than any window, so scrolled text always runs to the margins. */
const FILL_PX = 100_000

export interface ColumnLayout {
  /** The paginator's `max-column-count`. */
  columns: number
  /** The paginator's `max-inline-size`, in px. */
  maxInlineSize: number
}

/**
 * How the text fills the window. Scrolled text spans the whole width.
 * Paginated text is one column across the window, or two side by side when
 * one column would be longer than the reader's line length (`lineWidth`).
 * A window taller than wide always gets one column: the paginator allows no
 * more there.
 */
export function columnLayout(
  window: { width: number; height: number },
  lineWidth: number,
  flow: Flow,
): ColumnLayout {
  if (flow === 'scrolled') return { columns: 1, maxInlineSize: FILL_PX }
  const { width: windowWidth, height } = window
  const textWidth = windowWidth * (1 - 2 * SIDE_MARGIN)
  const columns = height < windowWidth && textWidth > lineWidth ? 2 : 1
  // The paginator uses min(max-column-count, ceil(width / max-inline-size))
  // columns; just under width / columns gives exactly `columns`, filling the window.
  return { columns, maxInlineSize: Math.floor(windowWidth / columns) - 1 }
}
