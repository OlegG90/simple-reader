import { describe, expect, it } from 'vitest'
import { columnLayout } from './layout'

// What the paginator will actually lay out for a given layout.
const paginatorColumns = (width: number, { columns, maxInlineSize }: { columns: number; maxInlineSize: number }) =>
  Math.min(columns, Math.ceil(width / maxInlineSize))

describe('columnLayout', () => {
  it('uses one full-width column while it is no longer than the line length', () => {
    const layout = columnLayout({ width: 800, height: 600 }, 1000, 'paginated')
    expect(layout.columns).toBe(1)
    expect(paginatorColumns(800, layout)).toBe(1)
    expect(layout.maxInlineSize).toBeGreaterThan(780)
  })

  it('splits into two columns when one would be longer than the line length', () => {
    const layout = columnLayout({ width: 1100, height: 800 }, 700, 'paginated')
    expect(layout.columns).toBe(2)
    expect(paginatorColumns(1100, layout)).toBe(2)
    expect(layout.maxInlineSize).toBeGreaterThan(540)
  })

  it('never uses more than two columns', () => {
    expect(columnLayout({ width: 4000, height: 1000 }, 500, 'paginated').columns).toBe(2)
  })

  it('keeps one full-width column in a window taller than wide', () => {
    const layout = columnLayout({ width: 900, height: 1200 }, 500, 'paginated')
    expect(layout.columns).toBe(1)
    expect(layout.maxInlineSize).toBeGreaterThan(880)
  })

  it('lets scrolled text span the window', () => {
    const layout = columnLayout({ width: 1600, height: 900 }, 700, 'scrolled')
    expect(layout.columns).toBe(1)
    expect(layout.maxInlineSize).toBeGreaterThan(1600)
  })
})
