export const THEMES = ['system', 'light', 'dark', 'sepia'] as const
export type Theme = (typeof THEMES)[number]
/** What "system" resolves to, and what the app's CSS knows how to draw. */
export type ResolvedTheme = Exclude<Theme, 'system'>

/** System fonts only; `publisher` keeps the book's own fonts. */
export const FONTS = ['Georgia', 'Cambria', 'Segoe UI', 'Calibri', 'publisher'] as const
export type Font = (typeof FONTS)[number]

export interface Range {
  min: number
  max: number
  step: number
}

export const FONT_SIZE: Range = { min: 12, max: 36, step: 1 }
export const LINE_HEIGHT: Range = { min: 1.2, max: 2.2, step: 0.1 }
/** Characters per line. */
export const LINE_LENGTH: Range = { min: 45, max: 100, step: 5 }

/** How books look; global, not per book. */
export interface Appearance {
  theme: Theme
  font: Font
  fontSize: number
  lineHeight: number
  lineLength: number
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  font: 'Georgia',
  fontSize: 19,
  lineHeight: 1.5,
  lineLength: 70,
}

/** Colours the book is drawn with, taken from the app's current theme. */
export interface BookColors {
  theme: ResolvedTheme
  text: string
  link: string
}

const clamp = (value: unknown, { min, max }: Range, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** Reads appearance from stored settings, replacing missing or invalid values with defaults. */
export function readAppearance(stored: Record<string, unknown>): Appearance {
  const d = DEFAULT_APPEARANCE
  return {
    theme: oneOf(stored.theme, THEMES, d.theme),
    font: oneOf(stored.font, FONTS, d.font),
    fontSize: clamp(stored.fontSize, FONT_SIZE, d.fontSize),
    lineHeight: clamp(stored.lineHeight, LINE_HEIGHT, d.lineHeight),
    lineLength: clamp(stored.lineLength, LINE_LENGTH, d.lineLength),
  }
}

export const isAppearanceKey = (key: string): key is keyof Appearance => key in DEFAULT_APPEARANCE

export const nextTheme = (theme: Theme): Theme => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

export const stepFontSize = (size: number, direction: 1 | -1) =>
  clamp(size + direction * FONT_SIZE.step, FONT_SIZE, size)

/** An average character of body text is about half an em wide. */
const CHAR_WIDTH_EM = 0.5

/** The column width that fits `lineLength` characters at the current font size. */
export const columnWidthPx = ({ lineLength, fontSize }: Appearance) => Math.round(lineLength * fontSize * CHAR_WIDTH_EM)

const FONT_STACKS: Record<Exclude<Font, 'publisher'>, string> = {
  Georgia: 'Georgia, serif',
  Cambria: 'Cambria, serif',
  'Segoe UI': '"Segoe UI", sans-serif',
  Calibri: 'Calibri, sans-serif',
}

/**
 * Blocks of body text get the reader's font; inline elements inherit it unless
 * the book styles them (monospace, drop caps, other scripts), and code is never touched.
 */
const TEXT_BLOCKS = 'body, body :is(p, div, li, blockquote, dd, dt, h1, h2, h3, h4, h5, h6, td, th, figcaption)'

/**
 * In light the book keeps its own colours. Dark and sepia repaint all text,
 * since colours meant for a white page are unreadable or jarring there.
 */
const repaint = ({ theme, text, link }: BookColors) =>
  theme === 'light'
    ? ''
    : `
  html, body, body * {
    color: ${text} !important;
    background-color: transparent !important;
  }
  a:any-link, a:any-link * {
    color: ${link} !important;
  }`

/** The stylesheet the app lays over every book. */
export function bookCss(appearance: Appearance, colors: BookColors): string {
  const { font, fontSize, lineHeight } = appearance
  const fontRule = font === 'publisher' ? '' : `${TEXT_BLOCKS} { font-family: ${FONT_STACKS[font]} !important; }`
  return `
  @namespace epub "http://www.idpf.org/2007/ops";
  html {
    color-scheme: ${colors.theme === 'dark' ? 'dark' : 'light'};
    font-size: ${fontSize}px !important;
  }
  /* The reader sets the size; relative sizes inside the book still scale from it. */
  body {
    font-size: 1rem !important;
  }
  /* The app paints the page. */
  html, body {
    background: none !important;
  }
  ${repaint(colors)}
  ${fontRule}
  p, li, blockquote, dd {
    line-height: ${lineHeight} !important;
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
