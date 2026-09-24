import './vendor/foliate-js/view.js'
import { FootnoteHandler } from './vendor/foliate-js/footnotes.js'

export type Flow = 'paginated' | 'scrolled'

interface TocItem {
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
  destroy?(): void
}

/** A book file for foliate-js to parse, or a book object the app built itself (Markdown). */
export type BookSource = File | object

interface Renderer extends HTMLElement {
  setStyles?(css: string): void
  getContents(): { doc: Document }[]
  /** In scrolled flow: the laid-out content height, including the margins. */
  readonly viewSize: number
  goTo(target: { index: number; anchor: () => number }): Promise<void>
}

/** The parts of foliate-js's `<foliate-view>` this app uses. */
interface FoliateView extends HTMLElement {
  book: Book
  renderer: Renderer
  lastLocation: Relocation | null
  open(book: BookSource): Promise<void>
  init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  close(): void
  goTo(target: string | number): Promise<unknown>
  goToFraction(fraction: number): Promise<void>
  goLeft(): Promise<void>
  goRight(): Promise<void>
  next(distance?: number): Promise<void>
  prev(distance?: number): Promise<void>
}

interface BookViewEvents {
  relocate(location: Relocation): void
  /** Key presses inside the book, which lives in iframes. */
  key(event: KeyboardEvent): void
  /** Mouse movement inside the book: the distance from the window top. */
  pointer(y: number): void
  externalLink(href: string): void
}

/** Footnote pop-ups: note headings (often just the note number) stay small. */
const NOTE_CSS = `
  h1, h2, h3, h4, h5, h6 {
    font-size: 1em !important;
    text-align: start !important;
    margin: 0 !important;
  }
  .title {
    margin: 0 0 0.4em !important;
  }
`
const NOTE_MARGIN_PX = 16
/** The pop-up's border, which box-sizing takes out of its height (see style.css). */
const NOTE_BORDER_PX = 2

/** Share of the window width that turns pages when clicked. */
const EDGE_CLICK = 0.2
const WHEEL_PAUSE_MS = 250
const LINE_PX = 60
/** Paginated books show two columns in windows at least this wide. */
const twoColumns = matchMedia('(min-width: 1400px)')

const formatLang = (x?: LangMap) => (!x ? '' : typeof x === 'string' ? x : (Object.values(x)[0] ?? ''))

const formatAuthor = (author?: Contributor | Contributor[]) =>
  (Array.isArray(author) ? author : author ? [author] : [])
    .map(c => (typeof c === 'string' ? c : formatLang(c.name)))
    .filter(Boolean)
    .join(', ')

const isWebLink = (href: string) => /^https?:/i.test(href)

/** How the app draws the book (see appearance.ts). */
export interface BookStyle {
  css: string
  /** Maximum width of a text column, in px. */
  columnWidth: number
}

interface OpenOptions {
  flow: Flow
  lastLocation?: string
  style: BookStyle
}

/** A book rendered by foliate-js, with the app's input handling attached. */
export class BookView {
  readonly view = document.createElement('foliate-view') as FoliateView
  #footnotes = new FootnoteHandler()
  #css = ''
  #lastWheel = 0
  #updateColumns = () =>
    this.view.renderer.setAttribute('max-column-count', twoColumns.matches ? '2' : '1')

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
    source: BookSource,
    options: OpenOptions,
    events: BookViewEvents,
  ): Promise<BookView> {
    const book = new BookView(host, footnoteHost, events)
    try {
      await book.#open(source, options)
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

  /** The current reading position (a CFI), if the book has been laid out. */
  get location() {
    return this.view.lastLocation?.cfi
  }

  get flow(): Flow {
    return this.view.renderer.getAttribute('flow') === 'scrolled' ? 'scrolled' : 'paginated'
  }

  set flow(flow: Flow) {
    this.view.renderer.setAttribute('flow', flow)
  }

  /** Scrolls a line in scrolled mode, turns a page in paginated mode. */
  lineDown() {
    return this.view.next(this.#lineDistance())
  }

  lineUp() {
    return this.view.prev(this.#lineDistance())
  }

  #lineDistance() {
    return this.flow === 'scrolled' ? LINE_PX : undefined
  }

  /** Restyles the book, keeping the reading position. An open note would keep the old style, so it closes. */
  setStyle({ css, columnWidth }: BookStyle) {
    this.hideFootnote()
    this.#css = css
    this.view.renderer.setStyles?.(css)
    // Every change to this attribute re-lays the whole book out.
    const width = `${columnWidth}px`
    if (this.view.renderer.getAttribute('max-inline-size') !== width)
      this.view.renderer.setAttribute('max-inline-size', width)
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
    twoColumns.removeEventListener('change', this.#updateColumns)
    this.hideFootnote()
    this.view.close()
    this.view.book?.destroy?.()
    this.view.remove()
  }

  async #open(source: BookSource, { flow, lastLocation, style }: OpenOptions) {
    const { view } = this
    await view.open(source)
    this.flow = flow
    this.setStyle(style)
    this.#updateColumns()
    twoColumns.addEventListener('change', this.#updateColumns)

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

    // A saved location can stop resolving (e.g. after a Markdown edit); start over then.
    await view.init({ lastLocation, showTextStart: true }).catch(() => view.init({ showTextStart: true }))
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
      // The renderer re-lays the note out (and relocates) whenever it reflows;
      // fit the pop-up to it. CSS max-height caps long notes, which then scroll.
      note.addEventListener('relocate', () => {
        this.footnoteHost.style.height = `${Math.ceil(note.renderer.viewSize) + NOTE_BORDER_PX}px`
      })
      note.renderer.setAttribute('flow', 'scrolled')
      note.renderer.setAttribute('margin', `${NOTE_MARGIN_PX}px`)
      note.renderer.setAttribute('gap', '6%')
      note.renderer.setStyles?.(this.#css + NOTE_CSS)
      // Lay the note out off-screen so it has a size before it is shown.
      this.footnoteHost.style.visibility = 'hidden'
      this.footnoteHost.style.height = ''
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
