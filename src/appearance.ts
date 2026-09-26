import { CODE_ATTR, DIAGRAM_ATTR } from './code-blocks'

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

/** The width of `lineLength` characters at the current font size, in px. */
export const lineWidthPx = ({ lineLength, fontSize }: Appearance) => Math.round(lineLength * fontSize * CHAR_WIDTH_EM)

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
 * Highlighted code (below) and Markdown's tinted blocks (MARKDOWN_CSS in
 * markdown-book.ts) are written to outrank these selectors.
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

/** highlight.js token classes, grouped by the colour they get (after GitHub's themes). */
const TOKEN_ROLES = {
  keyword: 'keyword, doctag, template-tag, template-variable, type, variable.language_, meta .hljs-keyword, deletion',
  title: 'title, title.class_, title.function_',
  constant: 'attr, attribute, literal, meta, number, operator, variable, selector-attr, selector-class, selector-id, section',
  string: 'string, regexp, meta .hljs-string',
  builtin: 'built_in, symbol, bullet',
  comment: 'comment, code, formula',
  tag: 'name, quote, selector-tag, selector-pseudo, addition',
}
type TokenRole = keyof typeof TOKEN_ROLES

const TOKEN_COLORS: Record<ResolvedTheme, Record<TokenRole, string>> = {
  light: {
    keyword: '#cf222e', title: '#8250df', constant: '#0550ae', string: '#0a3069',
    builtin: '#953800', comment: '#6e7781', tag: '#116329',
  },
  dark: {
    keyword: '#ff7b72', title: '#d2a8ff', constant: '#79c0ff', string: '#a5d6ff',
    builtin: '#ffa657', comment: '#8b949e', tag: '#7ee787',
  },
  sepia: {
    keyword: '#a32d2d', title: '#6c3d99', constant: '#1d5c8c', string: '#3e6b1f',
    builtin: '#9a4f0b', comment: '#8c7b66', tag: '#2f6b43',
  },
}

/** Colours highlighted code for the theme; they win over the dark / sepia repaint. */
const codeCss = (theme: ResolvedTheme) =>
  Object.entries(TOKEN_ROLES)
    .map(([role, tokens]) => {
      const selectors = tokens.split(', ').map(token => `[${CODE_ATTR}] .hljs-${token}`)
      return `${selectors.join(', ')} { color: ${TOKEN_COLORS[theme][role as TokenRole]} !important; }`
    })
    .join('\n  ')

/**
 * Diagrams are drawn in light greys on a transparent background. Dark turns
 * them into dark greys a shade lighter than the page; sepia warms them.
 */
const DIAGRAM_FILTERS: Record<ResolvedTheme, string> = {
  light: '',
  dark: 'invert(0.88) hue-rotate(180deg)',
  sepia: 'sepia(0.5) brightness(0.96)',
}

const diagramCss = (theme: ResolvedTheme) =>
  DIAGRAM_FILTERS[theme] && `img[${DIAGRAM_ATTR}] { filter: ${DIAGRAM_FILTERS[theme]}; }`

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
  ${codeCss(colors.theme)}
  ${diagramCss(colors.theme)}
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
