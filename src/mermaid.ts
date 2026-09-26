import type { Mermaid } from 'mermaid'

let mermaid: Promise<Mermaid> | undefined

/** Mermaid is large, so it loads with the first diagram. */
const load = () =>
  (mermaid ??= import('mermaid').then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      // Greys on a transparent background: works on every page colour, and
      // inverts cleanly for the dark theme.
      theme: 'neutral',
      securityLevel: 'strict',
      suppressErrorRendering: true,
    })
    return m
  }))

let nextId = 0

/** Renders Mermaid source to a standalone SVG document. */
export async function renderMermaid(source: string): Promise<string> {
  const { svg } = await (await load()).render(`sreader-diagram-${nextId++}`, source)
  return standaloneSvg(svg)
}

/**
 * Mermaid's markup is meant to be inlined into a page. As an image it needs
 * well-formed XML (its HTML labels included) and a size of its own.
 */
export function standaloneSvg(markup: string): string {
  const svg = new DOMParser().parseFromString(markup, 'text/html').querySelector('svg')
  if (!svg) throw new Error('Mermaid produced no diagram')
  const [, , width, height] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  if (width > 0 && height > 0) {
    svg.setAttribute('width', `${width}`)
    svg.setAttribute('height', `${height}`)
  }
  // An inline max-width that the image's own sizing replaces.
  svg.removeAttribute('style')
  return new XMLSerializer().serializeToString(svg)
}
