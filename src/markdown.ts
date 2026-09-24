import { Marked } from 'marked'

export interface Heading {
  level: number
  text: string
  id: string
}

interface RenderedMarkdown {
  html: string
  /** H1–H3, in document order, for the table of contents. */
  headings: Heading[]
  /** The first H1, if any. */
  title: string
}

/** Removes a leading YAML front matter block (`---` … `---` or `...`). */
export const stripFrontMatter = (source: string) =>
  source.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, '')

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Decodes the HTML entities Markdown text keeps (named basics and numeric ones). */
const decodeEntities = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== '#') return NAMED_ENTITIES[name.toLowerCase()] ?? entity
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
  })

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-') || 'section'

/** Renders GitHub-flavored Markdown; every heading gets a unique id for links and the TOC. */
export function renderMarkdown(source: string): RenderedMarkdown {
  const headings: Heading[] = []
  const taken = new Set<string>()
  const uniqueId = (text: string) => {
    const slug = slugify(text)
    let id = slug
    for (let n = 1; taken.has(id); n++) id = `${slug}-${n}`
    taken.add(id)
    return id
  }

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens)
        const text = decodeEntities(this.parser.parseInline(tokens, this.parser.textRenderer)).trim()
        const id = uniqueId(text)
        if (depth <= 3) headings.push({ level: depth, text, id })
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`
      },
    },
  })

  const html = marked.parse(stripFrontMatter(source), { async: false })
  return { html, headings, title: headings.find(h => h.level === 1)?.text ?? '' }
}

export interface TocItem {
  label: string
  href?: string
  subitems?: TocItem[]
}

/** Nests headings into a tree (H2 under the H1 before it, and so on). */
export function headingsToToc(headings: Heading[]): TocItem[] {
  const root: TocItem[] = []
  const stack: { level: number; item: TocItem }[] = []
  for (const { level, text, id } of headings) {
    const item: TocItem = { label: text, href: `#${id}` }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
    const parent = stack[stack.length - 1]?.item
    if (parent) (parent.subitems ??= []).push(item)
    else root.push(item)
    stack.push({ level, item })
  }
  return root
}

/** Whether an image source points at a file next to the Markdown file. */
export const isLocalPath = (src: string) => !!src && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)
