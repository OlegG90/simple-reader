import './vendor/foliate-js/view.js'
import { FootnoteHandler } from './vendor/foliate-js/footnotes.js'

export type Flow = 'paginated' | 'scrolled'

export interface TocItem {
  label: string
  href?: string
  subitems?: TocItem[]
}

export interface Relocation {
  fraction: number
  cfi: string
  tocItem?: TocItem
  section?: { current: number }
}

type LangMap = string | Record<string, string>
type Contributor = string | { name?: LangMap }

interface Book {
  metadata?: { title?: LangMap; author?: Contributor | Contributor[] }
  toc?: TocItem[]
}

interface Renderer extends HTMLElement {
  setStyles?(css: string): void
  goTo(target: { index: number; anchor: () => number }): Promise<void>
}

/** The parts of foliate-js's `<foliate-view>` this app uses. */
interface FoliateView extends HTMLElement {
  book: Book
  renderer: Renderer
  lastLocation: Relocation | null
  open(book: File | Book): Promise<void>
  init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  close(): void
  goTo(target: string | number): Promise<unknown>
  goToFraction(fraction: number): Promise<void>
  goLeft(): Promise<void>
  goRight(): Promise<void>
  next(distance?: number): Promise<void>
  prev(distance?: number): Promise<void>
}

export interface BookViewEvents {
  relocate(location: Relocation): void
  /** Key presses inside the book, which lives in iframes. */
  key(event: KeyboardEvent): void
  /** Mouse movement inside the book: the distance from the window top. */
  pointer(y: number): void
  externalLink(href: string): void
}

const BOOK_CSS = `
  @namespace epub "http://www.idpf.org/2007/ops";
  html {
    color-scheme: light dark;
    font-size: 19px;
  }
  /* The app paints the page; many books hard-code a white page and black text. */
  html, body {
    background: none !important;
  }
  @media (prefers-color-scheme: dark) {
    html, body, body * {
      color: #d8d8d6 !important;
      background-color: transparent !important;
    }
    a:any-link, a:any-link * {
      color: #8ab4f8 !important;
    }
  }
  body {
    font-family: Georgia, serif;
  }
  p, li, blockquote, dd {
    line-height: 1.5;
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

/** Share of the window width that turns pages when clicked. */
const EDGE_CLICK = 0.2
const WHEEL_PAUSE_MS = 250
const LINE_PX = 60
/** Window width from which paginated books show two columns. */
const TWO_COLUMNS_FROM_PX = 1400

const formatLang = (x?: LangMap) => (!x ? '' : typeof x === 'string' ? x : (Object.values(x)[0] ?? ''))

const formatAuthor = (author?: Contributor | Contributor[]) =>
  (Array.isArray(author) ? author : author ? [author] : [])
    .map(c => (typeof c === 'string' ? c : formatLang(c.name)))
    .filter(Boolean)
    .join(', ')

const isWebLink = (href: string) => /^https?:/i.test(href)

interface OpenOptions {
  flow: Flow
  lastLocation?: string
}

/** A book rendered by foliate-js, with the app's input handling attached. */
export class BookView {
  readonly view = document.createElement('foliate-view') as FoliateView
  #footnotes = new FootnoteHandler()
  #lastWheel = 0
  #onResize = () => this.#updateColumns()

  private constructor(
    host: HTMLElement,
    private footnoteHost: HTMLElement,
    private events: BookViewEvents,
  ) {
    host.append(this.view)
  }

  static async open(
    host: HTMLElement,
    footnoteHost: HTMLElement,
    file: File,
    options: OpenOptions,
    events: BookViewEvents,
  ): Promise<BookView> {
    const book = new BookView(host, footnoteHost, events)
    try {
      await book.#open(file, options)
    } catch (e) {
      book.destroy()
      throw e
    }
    return book
  }

  get title() {
    return formatLang(this.view.book.metadata?.title)
  }

  get author() {
    return formatAuthor(this.view.book.metadata?.author)
  }

  get toc() {
    return this.view.book.toc ?? []
  }

  get flow(): Flow {
    return this.view.renderer.getAttribute('flow') === 'scrolled' ? 'scrolled' : 'paginated'
  }

  set flow(flow: Flow) {
    this.view.renderer.setAttribute('flow', flow)
  }

  lineDown() {
    return this.flow === 'scrolled' ? this.view.next(LINE_PX) : this.view.next()
  }

  lineUp() {
    return this.flow === 'scrolled' ? this.view.prev(LINE_PX) : this.view.prev()
  }

  goToChapterEdge(edge: 'start' | 'end') {
    const index = this.view.lastLocation?.section?.current
    if (index == null) return
    const anchor = edge === 'start' ? 0 : 1
    return this.view.renderer.goTo({ index, anchor: () => anchor })
  }

  hideFootnote() {
    this.footnoteHost.hidden = true
    this.footnoteHost.replaceChildren()
  }

  destroy() {
    removeEventListener('resize', this.#onResize)
    this.hideFootnote()
    this.view.close()
    this.view.remove()
  }

  async #open(file: File, { flow, lastLocation }: OpenOptions) {
    const { view } = this
    await view.open(file)
    view.renderer.setAttribute('flow', flow)
    view.renderer.setAttribute('max-inline-size', '700px')
    this.#updateColumns()
    addEventListener('resize', this.#onResize)
    view.renderer.setStyles?.(BOOK_CSS)

    view.addEventListener('relocate', e => this.events.relocate((e as CustomEvent<Relocation>).detail))
    view.addEventListener('load', e => this.#attachInput((e as CustomEvent<{ doc: Document }>).detail.doc))
    view.addEventListener('external-link', e => this.#onExternalLink(e as CustomEvent))
    view.addEventListener('link', e => {
      this.#footnotes.handle(view.book, e)?.catch((err: unknown) => {
        console.error(err)
        this.hideFootnote()
      })
    })
    // The page margins lie outside the book's iframes.
    view.addEventListener('wheel', e => this.#onWheel(e), { passive: true })
    view.addEventListener('click', e => this.#onEdgeClick(e.clientX))
    this.#setUpFootnotes()

    await view.init({ lastLocation, showTextStart: true })
  }

  #updateColumns() {
    const columns = innerWidth >= TWO_COLUMNS_FROM_PX ? '2' : '1'
    if (this.view.renderer.getAttribute('max-column-count') !== columns)
      this.view.renderer.setAttribute('max-column-count', columns)
  }

  #setUpFootnotes() {
    this.#footnotes.addEventListener('before-render', e => {
      const note = (e as CustomEvent<{ view: FoliateView }>).detail.view
      note.addEventListener('link', ev => {
        ev.preventDefault()
        this.hideFootnote()
        this.view.goTo((ev as CustomEvent<{ href: string }>).detail.href)
      })
      note.addEventListener('external-link', ev => this.#onExternalLink(ev as CustomEvent))
      note.addEventListener('load', ev => {
        const { doc } = (ev as CustomEvent<{ doc: Document }>).detail
        doc.addEventListener('keydown', k => this.events.key(k))
      })
      note.renderer.setAttribute('flow', 'scrolled')
      note.renderer.setAttribute('margin', '16px')
      note.renderer.setAttribute('gap', '6%')
      note.renderer.setStyles?.(BOOK_CSS)
      // Lay the note out off-screen so it has a size before it is shown.
      this.footnoteHost.style.visibility = 'hidden'
      this.footnoteHost.hidden = false
      this.footnoteHost.replaceChildren(note)
    })
    this.#footnotes.addEventListener('render', () => {
      this.footnoteHost.style.visibility = ''
    })
  }

  #onExternalLink(e: CustomEvent<{ href_: string }>) {
    e.preventDefault()
    if (isWebLink(e.detail.href_)) this.events.externalLink(e.detail.href_)
  }

  #attachInput(doc: Document) {
    const toWindow = (ev: MouseEvent) => {
      const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
      return { x: (frame?.left ?? 0) + ev.clientX, y: (frame?.top ?? 0) + ev.clientY }
    }
    doc.addEventListener('keydown', ev => this.events.key(ev))
    doc.addEventListener('wheel', ev => this.#onWheel(ev), { passive: true })
    doc.addEventListener('mousemove', ev => this.events.pointer(toWindow(ev).y))
    doc.addEventListener('click', ev => {
      if (ev.defaultPrevented || (ev.target as Element).closest?.('a[href]')) return
      if (doc.getSelection()?.toString()) return
      this.hideFootnote()
      this.#onEdgeClick(toWindow(ev).x)
    })
  }

  #onEdgeClick(x: number) {
    if (this.flow !== 'paginated') return
    if (x < innerWidth * EDGE_CLICK) this.view.goLeft()
    else if (x > innerWidth * (1 - EDGE_CLICK)) this.view.goRight()
  }

  #onWheel(e: WheelEvent) {
    if (this.flow !== 'paginated' || e.deltaY === 0) return
    const now = performance.now()
    if (now - this.#lastWheel < WHEEL_PAUSE_MS) return
    this.#lastWheel = now
    if (e.deltaY > 0) this.view.next()
    else this.view.prev()
  }
}
