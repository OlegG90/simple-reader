export const THEMES = ['system', 'light', 'dark', 'sepia'] as const
export type Theme = (typeof THEMES)[number]

/** System fonts only; `publisher` keeps the book's own fonts. */
export const FONTS = ['Georgia', 'Cambria', 'Segoe UI', 'Calibri', 'publisher'] as const
export type Font = (typeof FONTS)[number]

export const FONT_SIZE = { min: 12, max: 36, step: 1 } as const
export const LINE_HEIGHT = { min: 1.2, max: 2.2, step: 0.1 } as const
export const COLUMN_WIDTH = { min: 500, max: 1000, step: 50 } as const

/** How books look; global, not per book. */
export interface Appearance {
  theme: Theme
  font: Font
  fontSize: number
  lineHeight: number
  /** Maximum width of a text column, in px. */
  columnWidth: number
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  font: 'Georgia',
  fontSize: 19,
  lineHeight: 1.5,
  columnWidth: 700,
}

/** Colours the book is drawn with, taken from the app's current theme. */
export interface BookColors {
  scheme: 'light' | 'dark'
  text: string
  link: string
}

const clamp = (value: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** Reads appearance from stored settings, replacing missing or invalid values with defaults. */
export function readAppearance(stored: Record<string, unknown>): Appearance {
  const d = DEFAULT_APPEARANCE
  return {
    theme: oneOf(stored.theme, THEMES, d.theme),
    font: oneOf(stored.font, FONTS, d.font),
    fontSize: clamp(stored.fontSize, FONT_SIZE, d.fontSize),
    lineHeight: clamp(stored.lineHeight, LINE_HEIGHT, d.lineHeight),
    columnWidth: clamp(stored.columnWidth, COLUMN_WIDTH, d.columnWidth),
  }
}

export const nextTheme = (theme: Theme): Theme => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

export const stepFontSize = (size: number, direction: 1 | -1) =>
  clamp(size + direction * FONT_SIZE.step, FONT_SIZE, size)

const FONT_STACKS: Record<Exclude<Font, 'publisher'>, string> = {
  Georgia: 'Georgia, serif',
  Cambria: 'Cambria, serif',
  'Segoe UI': '"Segoe UI", sans-serif',
  Calibri: 'Calibri, sans-serif',
}

/** Code keeps its monospace font whatever font the reader picks. */
const TEXT = 'body, body *:not(pre, code, kbd, samp, tt, pre *, code *)'

/** The stylesheet the app lays over every book. */
export function bookCss(a: Appearance, colors: BookColors): string {
  const font = a.font === 'publisher' ? '' : `${TEXT} { font-family: ${FONT_STACKS[a.font]} !important; }`
  return `
  @namespace epub "http://www.idpf.org/2007/ops";
  html {
    color-scheme: ${colors.scheme};
    font-size: ${a.fontSize}px;
  }
  /* The app paints the page and the text; many books hard-code black on white. */
  html, body, body * {
    color: ${colors.text} !important;
    background-color: transparent !important;
  }
  html, body {
    background: none !important;
  }
  a:any-link, a:any-link * {
    color: ${colors.link} !important;
  }
  ${font}
  p, li, blockquote, dd {
    line-height: ${a.lineHeight} !important;
    text-align: justify;
    hyphens: auto;
    -webkit-hyphenate-limit-before: 3;
    -webkit-hyphenate-limit-after: 2;
    -webkit-hyphenate-limit-lines: 2;
    widows: 2;
  }
  [align="left"] { text-align: left; }
  [align="right"] { text-align: right; }
  [align="center"] { text-align: center; }
  [align="justify"] { text-align: justify; }
  pre {
    white-space: pre-wrap !important;
  }
  aside[epub|type~="endnote"],
  aside[epub|type~="footnote"],
  aside[epub|type~="note"],
  aside[epub|type~="rearnote"] {
    display: none;
  }
`
}
