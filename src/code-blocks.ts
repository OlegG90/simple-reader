/** Marks an image rendered from a Mermaid block (the book stylesheet adapts it to the theme). */
export const DIAGRAM_ATTR = 'data-sreader-diagram'
/** Marks a highlighted code block (the book stylesheet colours its tokens). */
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
  Array.from(doc.querySelectorAll('pre > code'), code => ({
    code,
    source: code.textContent ?? '',
    language: code.className.match(/(?:^|\s)language-(\S+)/)?.[1].toLowerCase(),
  })).filter((block): block is { code: Element; source: string; language: string } => !!block.language)

/**
 * Replaces each `mermaid` block with an image of the diagram. A block that
 * fails to render stays as code, so its source can still be read.
 */
export async function renderDiagrams(doc: Document, render: RenderDiagram, toUrl: (blob: Blob) => string) {
  // One at a time: Mermaid renders sequentially anyway.
  for (const { code, source, language } of fencedBlocks(doc)) {
    if (language !== 'mermaid') continue
    let diagram: Diagram
    try {
      diagram = await render(source)
    } catch {
      continue
    }
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
  const blocks = fencedBlocks(doc)
  // Loaded only for files that have code in a named language.
  if (!blocks.length) return
  const { default: hljs } = await import('./highlight')
  for (const { code, source, language } of blocks) {
    if (!hljs.getLanguage(language)) continue
    code.innerHTML = hljs.highlight(source, { language, ignoreIllegals: true }).value
    code.setAttribute(CODE_ATTR, '')
  }
}
