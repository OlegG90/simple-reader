import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, bookCss, columnWidthPx, nextTheme, readAppearance, stepFontSize } from './appearance'

const dark = { theme: 'dark', text: '#ddd', link: '#8ab4f8' } as const
const light = { theme: 'light', text: '#111', link: '#15b' } as const

describe('readAppearance', () => {
  it('fills in defaults for an empty store', () => {
    expect(readAppearance({})).toEqual(DEFAULT_APPEARANCE)
  })

  it('keeps valid values and replaces invalid ones', () => {
    const a = readAppearance({ theme: 'sepia', font: 'Comic Sans', fontSize: 99, lineHeight: 'x', lineLength: 80 })
    expect(a).toEqual({ ...DEFAULT_APPEARANCE, theme: 'sepia', fontSize: 36, lineLength: 80 })
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

describe('columnWidthPx', () => {
  it('fits the line length at the current font size', () => {
    expect(columnWidthPx({ ...DEFAULT_APPEARANCE, lineLength: 70, fontSize: 20 })).toBe(700)
    expect(columnWidthPx({ ...DEFAULT_APPEARANCE, lineLength: 70, fontSize: 30 })).toBe(1050)
  })
})

describe('bookCss', () => {
  it('applies size and spacing over the book', () => {
    const css = bookCss({ ...DEFAULT_APPEARANCE, fontSize: 22, lineHeight: 1.8 }, dark)
    expect(css).toContain('font-size: 22px !important')
    expect(css).toContain('font-size: 1rem !important')
    expect(css).toContain('line-height: 1.8 !important')
  })

  it('repaints text in dark and sepia but keeps book colours in light', () => {
    const darkCss = bookCss(DEFAULT_APPEARANCE, dark)
    expect(darkCss).toContain('color-scheme: dark')
    expect(darkCss).toContain('color: #ddd !important')
    expect(darkCss).toContain('color: #8ab4f8 !important')
    const lightCss = bookCss(DEFAULT_APPEARANCE, light)
    expect(lightCss).toContain('color-scheme: light')
    expect(lightCss).not.toContain('#111')
  })

  it('sets the font on text blocks only', () => {
    const css = bookCss({ ...DEFAULT_APPEARANCE, font: 'Segoe UI' }, dark)
    expect(css).toMatch(/body :is\(p, div[^{]*\{ font-family: "Segoe UI", sans-serif !important; \}/)
    expect(css).not.toMatch(/:is\([^)]*(code|pre|span)/)
  })

  it('keeps the publisher font when asked', () => {
    expect(bookCss({ ...DEFAULT_APPEARANCE, font: 'publisher' }, dark)).not.toContain('font-family')
  })
})
