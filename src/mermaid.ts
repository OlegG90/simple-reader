import type { Mermaid } from 'mermaid'
import type { Diagram } from './code-blocks'

/** The size Mermaid sets diagram text in. */
const FONT_PX = 16

let mermaidLoading: Promise<Mermaid> | undefined

/** Mermaid is large, so it loads with the first diagram. */
function load() {
  mermaidLoading ??= import('mermaid').then(
    ({ default: m }) => {
      m.initialize({
        startOnLoad: false,
        // Greys on a transparent background: works on every page colour, and
        // the theme filters in code-blocks.ts adapt it to dark and sepia.
        theme: 'neutral',
        fontSize: FONT_PX,
        securityLevel: 'strict',
        suppressErrorRendering: true,
      })
      return m
    },
    error => {
      // Let the next diagram try again rather than failing for the whole session.
      mermaidLoading = undefined
      throw error
    },
  )
  return mermaidLoading
}

let nextId = 0

/** Renders Mermaid source to a diagram; throws if the source doesn't parse. */
export async function renderMermaid(source: string): Promise<Diagram> {
  const { svg } = await (await load()).render(`sreader-diagram-${nextId++}`, source)
  return standaloneSvg(svg)
}

/**
 * Mermaid's markup is meant to be inlined into a page. As an image it needs
 * well-formed XML (its HTML labels included) and a size of its own.
 */
export function standaloneSvg(markup: string): Diagram {
  const svg = new DOMParser().parseFromString(markup, 'text/html').querySelector('svg')
  const [, , width, height] = (svg?.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  if (!svg || !(width > 0 && height > 0)) throw new Error('Mermaid produced no sized diagram')
  svg.setAttribute('width', `${width}`)
  svg.setAttribute('height', `${height}`)
  // An inline max-width that the image's own sizing replaces.
  svg.removeAttribute('style')
  return { svg: new XMLSerializer().serializeToString(svg), width: width / FONT_PX }
}
