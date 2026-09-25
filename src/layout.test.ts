import { describe, expect, it } from 'vitest'
import { columnLayout } from './layout'

// What the paginator lays out: its column count and total text width.
const paginator = (width: number, { columns, maxInlineSize }: { columns: number; maxInlineSize: number }) => {
  const count = Math.min(columns, Math.ceil(width / maxInlineSize))
  return { columns: count, fills: maxInlineSize * count >= width }
}

describe('columnLayout', () => {
  it('uses one full-width column while it is no longer than the line length', () => {
    expect(paginator(800, columnLayout({ width: 800, height: 600 }, 1000, 'paginated'))).toEqual({ columns: 1, fills: true })
  })

  it('splits into two full-width columns when one would be longer than the line length', () => {
    expect(paginator(1100, columnLayout({ width: 1100, height: 800 }, 700, 'paginated'))).toEqual({ columns: 2, fills: true })
    expect(paginator(3000, columnLayout({ width: 3000, height: 1200 }, 500, 'paginated'))).toEqual({ columns: 2, fills: true })
  })

  it('keeps the current value while it still fits, so resizing rarely relays out', () => {
    const start = columnLayout({ width: 1100, height: 800 }, 700, 'paginated')
    expect(columnLayout({ width: 1200, height: 800 }, 700, 'paginated', start.maxInlineSize)).toEqual(start)
    const far = columnLayout({ width: 2000, height: 1000 }, 700, 'paginated', start.maxInlineSize)
    expect(far.maxInlineSize).not.toBe(start.maxInlineSize)
    expect(paginator(2000, far)).toEqual({ columns: 2, fills: true })
  })

  it('keeps one full-width column in a window taller than wide', () => {
    expect(paginator(900, columnLayout({ width: 900, height: 1200 }, 500, 'paginated'))).toEqual({ columns: 1, fills: true })
  })

  it('lets scrolled text span the window', () => {
    expect(paginator(1600, columnLayout({ width: 1600, height: 900 }, 700, 'scrolled'))).toEqual({ columns: 1, fills: true })
  })
})
