import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, bookCss, nextTheme, readAppearance, stepFontSize } from './appearance'

const colors = { scheme: 'dark', text: '#ddd', link: '#8ab4f8' } as const

describe('readAppearance', () => {
  it('fills in defaults for an empty store', () => {
    expect(readAppearance({})).toEqual(DEFAULT_APPEARANCE)
  })

  it('keeps valid values and replaces invalid ones', () => {
    const a = readAppearance({ theme: 'sepia', font: 'Comic Sans', fontSize: 99, lineHeight: 'x', columnWidth: 800 })
    expect(a).toEqual({ ...DEFAULT_APPEARANCE, theme: 'sepia', fontSize: 36, columnWidth: 800 })
  })
})

describe('theme and font size steps', () => {
  it('cycles through themes and wraps around', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('sepia')).toBe('system')
  })

  it('steps font size within limits', () => {
    expect(stepFontSize(19, 1)).toBe(20)
    expect(stepFontSize(36, 1)).toBe(36)
    expect(stepFontSize(12, -1)).toBe(12)
  })
})

describe('bookCss', () => {
  it('applies size, spacing and theme colours', () => {
    const css = bookCss({ ...DEFAULT_APPEARANCE, fontSize: 22, lineHeight: 1.8 }, colors)
    expect(css).toContain('font-size: 22px')
    expect(css).toContain('line-height: 1.8 !important')
    expect(css).toContain('color-scheme: dark')
    expect(css).toContain('color: #ddd !important')
    expect(css).toContain('color: #8ab4f8 !important')
  })

  it('overrides the font except for code', () => {
    const css = bookCss({ ...DEFAULT_APPEARANCE, font: 'Segoe UI' }, colors)
    expect(css).toMatch(/:not\(pre, code[^{]*\{ font-family: "Segoe UI", sans-serif !important; \}/)
  })

  it('keeps the publisher font when asked', () => {
    expect(bookCss({ ...DEFAULT_APPEARANCE, font: 'publisher' }, colors)).not.toContain('font-family')
  })
})
