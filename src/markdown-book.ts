import { headingsToToc, isLocalPath, renderMarkdown } from './markdown'

/** Base styles for rendered Markdown; the app's book stylesheet is laid over them. */
const MARKDOWN_CSS = `
  :root { --rule: rgba(128, 128, 128, 0.45); --tint: rgba(128, 128, 128, 0.15); }
  body { margin: 0; }
  img { max-width: 100%; }
  pre, code, kbd, samp { font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.9em; }
  pre { padding: 0.8em 1em; border: 1px solid var(--rule); border-radius: 6px; overflow-x: auto; }
  :not(pre) > code { padding: 0.1em 0.3em; border-radius: 4px; background: var(--tint); }
  pre code { font-size: 1em; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid var(--rule); padding: 0.3em 0.6em; text-align: start; }
  blockquote { margin: 1em 0; padding-inline-start: 1em; border-inline-start: 3px solid var(--rule); }
  li:has(> input[type="checkbox"]) { list-style: none; }
  li > input[type="checkbox"] { margin-inline: -1.4em 0.4em; }
  hr { border: 0; border-top: 1px solid var(--rule); }
`

/** Raw HTML in Markdown may not run code or embed other pages. */
const UNSAFE_ELEMENTS = 'script, iframe, frame, frameset, object, embed, base, meta, link, form'

function sanitize(doc: Document) {
  doc.body.querySelectorAll(UNSAFE_ELEMENTS).forEach(el => el.remove())
  for (const el of doc.body.querySelectorAll('*')) {
    for (const { name, value } of [...el.attributes]) {
      if (/^on/i.test(name) || /^\s*javascript:/i.test(value)) el.removeAttribute(name)
    }
  }
}

/** Loads the bytes of an image next to the Markdown file. */
export type LoadImage = (relativePath: string) => Promise<ArrayBuffer>

/** Browsers sniff most image types, but an SVG only renders with its type set. */
const imageBlob = (bytes: ArrayBuffer, path: string) =>
  new Blob([bytes], { type: path.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '' })

/** Decodes %-escapes, keeping text that isn't validly escaped as it is. */
const decode = (text: string) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * Turns a Markdown file into a single-section book for foliate-js. Headings
 * become the table of contents; local images are loaded through `loadImage`.
 */
export async function makeMarkdownBook(source: string, fileName: string, loadImage: LoadImage) {
  const { html, headings, title } = renderMarkdown(source)
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><head><meta charset="utf-8"><style>${MARKDOWN_CSS}</style></head><body>${html}</body></html>`,
    'text/html',
  )
  sanitize(doc)

  const urls: string[] = []
  const objectUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    urls.push(url)
    return url
  }

  await Promise.all(
    Array.from(doc.querySelectorAll('img'), async img => {
      const src = img.getAttribute('src') ?? ''
      if (!isLocalPath(src)) return
      const path = decode(src.split(/[?#]/)[0])
      const bytes = await loadImage(path).catch(() => null)
      if (bytes) img.src = objectUrl(imageBlob(bytes, path))
    }),
  )

  const markup = `<!doctype html>\n${doc.documentElement.outerHTML}`
  const blob = new Blob([markup], { type: 'text/html' })
  const url = objectUrl(blob)
  const fragment = (href: string) => decode(href.split('#')[1] ?? '')

  return {
    metadata: { title: title || fileName },
    sections: [
      {
        id: 0,
        load: () => url,
        createDocument: () => new DOMParser().parseFromString(markup, 'text/html'),
        size: blob.size,
        linear: 'yes',
      },
    ],
    toc: headingsToToc(headings),
    resolveHref: (href: string) => ({ index: 0, anchor: (d: Document) => d.getElementById(fragment(href)) }),
    splitTOCHref: (href: string) => [0, fragment(href)],
    getTOCFragment: (d: Document, id: string) => d.getElementById(id),
    // Only links to headings stay in the file. Anything else leaves it: web
    // links open in the browser, links to other files are ignored.
    isExternal: (uri: string) => !uri.startsWith('#'),
    destroy: () => urls.forEach(u => URL.revokeObjectURL(u)),
  }
}
