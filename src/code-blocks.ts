import type { ResolvedTheme } from './appearance'

/** Marks an image rendered from a Mermaid block (its theme filter below applies to it). */
export const DIAGRAM_ATTR = 'data-sreader-diagram'
/** Marks a highlighted code block (its token colours below apply to it). */
export const CODE_ATTR = 'data-sreader-code'

export interface Diagram {
  /** A standalone SVG document. */
  svg: string
  /** Width in ems of the surrounding text, so diagram text follows the reader's font size. */
  width: number
}

/** Renders Mermaid source to a diagram; throws if the source doesn't parse. */
export type RenderDiagram = (source: string) => Promise<Diagram>

/** Fenced code blocks with a language, as Markdown renders them: `<pre><code class="language-x">`. */
const fencedBlocks = (doc: Document) =>
  Array.from(doc.querySelectorAll('pre > code')).flatMap(code => {
    const language = code.className.match(/(?:^|\s)language-(\S+)/)?.[1].toLowerCase()
    return language ? [{ code, language, source: code.textContent ?? '' }] : []
  })

/**
 * Replaces each `mermaid` block with an image of the diagram. A block that
 * fails to render stays as code, so its source can still be read.
 */
export async function renderDiagrams(doc: Document, render: RenderDiagram, toUrl: (blob: Blob) => string) {
  // One at a time: Mermaid renders sequentially anyway.
  for (const { code, source } of fencedBlocks(doc).filter(block => block.language === 'mermaid')) {
    const diagram = await render(source).catch(() => null)
    if (!diagram) continue
    const img = doc.createElement('img')
    img.setAttribute(DIAGRAM_ATTR, '')
    img.alt = 'Diagram'
    img.src = toUrl(new Blob([diagram.svg], { type: 'image/svg+xml' }))
    img.style.width = `${diagram.width}em`
    code.parentElement!.replaceWith(img)
  }
}

/** Highlights code blocks in the languages highlight.js knows; others stay plain. */
export async function highlightCode(doc: Document) {
  // Mermaid blocks are diagrams (or stay plain when they don't parse).
  const blocks = fencedBlocks(doc).filter(block => block.language !== 'mermaid')
  // Loaded only for files that have code in a named language.
  if (!blocks.length) return
  const { default: hljs } = await import('./highlight')
  for (const { code, source, language } of blocks) {
    if (!hljs.getLanguage(language)) continue
    code.innerHTML = hljs.highlight(source, { language, ignoreIllegals: true }).value
    code.setAttribute(CODE_ATTR, '')
  }
}

/** highlight.js token classes and the colour each group gets per theme (after GitHub's themes). */
const TOKEN_COLORS: ({ tokens: string[] } & Record<ResolvedTheme, string>)[] = [
  {
    tokens: ['keyword', 'doctag', 'template-tag', 'template-variable', 'type', 'variable.language_', 'meta .hljs-keyword', 'deletion'],
    light: '#cf222e', dark: '#ff7b72', sepia: '#a32d2d',
  },
  { tokens: ['title', 'title.class_', 'title.function_'], light: '#8250df', dark: '#d2a8ff', sepia: '#6c3d99' },
  {
    tokens: ['attr', 'attribute', 'literal', 'meta', 'number', 'operator', 'variable', 'selector-attr', 'selector-class', 'selector-id', 'section'],
    light: '#0550ae', dark: '#79c0ff', sepia: '#1d5c8c',
  },
  { tokens: ['string', 'regexp', 'meta .hljs-string'], light: '#0a3069', dark: '#a5d6ff', sepia: '#3e6b1f' },
  { tokens: ['built_in', 'symbol', 'bullet'], light: '#953800', dark: '#ffa657', sepia: '#9a4f0b' },
  { tokens: ['comment', 'code', 'formula'], light: '#6e7781', dark: '#8b949e', sepia: '#8c7b66' },
  { tokens: ['name', 'quote', 'selector-tag', 'selector-pseudo', 'addition'], light: '#116329', dark: '#7ee787', sepia: '#2f6b43' },
]

/**
 * Diagrams are drawn in Mermaid's neutral theme (see mermaid.ts): light greys
 * on a transparent background. Dark turns them into dark greys a shade lighter
 * than the page; sepia warms them.
 */
const DIAGRAM_FILTERS: Partial<Record<ResolvedTheme, string>> = {
  dark: 'invert(0.88) hue-rotate(180deg)',
  sepia: 'sepia(0.5) brightness(0.96)',
}

/** Theme styles for highlighted code and diagrams; token colours win over the dark / sepia repaint. */
export function codeBlocksCss(theme: ResolvedTheme) {
  const tokens = TOKEN_COLORS.map(
    group => `${group.tokens.map(token => `[${CODE_ATTR}] .hljs-${token}`).join(', ')} { color: ${group[theme]} !important; }`,
  )
  const filter = DIAGRAM_FILTERS[theme]
  return [...tokens, filter ? `img[${DIAGRAM_ATTR}] { filter: ${filter}; }` : ''].join('\n  ')
}
