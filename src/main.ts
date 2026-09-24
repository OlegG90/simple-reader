import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { commandFor, type Command } from './keys'
import { BookView, type Flow, type Relocation } from './reader'
import { createTOCView } from './vendor/foliate-js/ui/tree.js'

interface Position {
  cfi: string
  fraction: number
}

interface BookInfo {
  fileName: string
  position: Position | null
}

type Settings = { bookFlow?: Flow } & Record<string, unknown>

const SAVE_DELAY_MS = 500
const TOP_EDGE_PX = 48

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const appWindow = getCurrentWindow()

let settings: Settings = {}
let book: BookView | null = null
let tocView: { element: HTMLElement; setCurrentHref(href: string): void } | null = null

// ---- Reading position -------------------------------------------------------

let pendingPosition: Position | null = null
let saveTimer: number | undefined

function scheduleSave(position: Position) {
  pendingPosition = position
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flushSave, SAVE_DELAY_MS)
}

async function flushSave() {
  clearTimeout(saveTimer)
  const position = pendingPosition
  pendingPosition = null
  if (position) await invoke('save_position', { position }).catch(console.error)
}

// ---- Opening books ----------------------------------------------------------

async function openCurrentBook() {
  await flushSave()
  closeBook()
  let info: BookInfo | null = null
  try {
    info = await invoke<BookInfo | null>('current_book')
    if (!info) {
      $('hint').hidden = false
      return
    }
    const bytes = await invoke<ArrayBuffer>('read_book')
    // foliate-js detects some formats by extension, so normalise its case.
    const file = new File([bytes], info.fileName.toLowerCase())
    book = await BookView.open($('stage'), $('footnote'), file, {
      flow: settings.bookFlow ?? 'paginated',
      lastLocation: info.position?.cfi,
    }, {
      relocate: onRelocate,
      key: onKey,
      pointer: (_, y) => onPointer(y),
      externalLink: href => void openUrl(href).catch(console.error),
    })
  } catch (e) {
    showError(info?.fileName, e)
    return
  }
  await appWindow.setTitle(book.title || info.fileName)
  $('toc-title').textContent = book.title || info.fileName
  $('toc-author').textContent = book.author
  tocView = createTOCView(book.toc, (href: string) => {
    book?.view.goTo(href).catch(console.error)
    closeToc()
  })
  $('toc-tree').replaceChildren(tocView!.element)
  $('progress').hidden = false
  updateFlowButton()
}

function closeBook() {
  book?.destroy()
  book = null
  tocView = null
  closeToc()
  $('toc-tree').replaceChildren()
  $('hint').hidden = true
  $('error').hidden = true
  $('progress').hidden = true
  $('topbar').classList.remove('shown')
}

function showError(fileName: string | undefined, error: unknown) {
  const box = $('error')
  const title = document.createElement('p')
  title.textContent = fileName ? `Can't open “${fileName}”` : "Can't open the book"
  const detail = document.createElement('p')
  detail.className = 'muted'
  detail.textContent = error instanceof Error ? error.message : String(error)
  box.replaceChildren(title, detail)
  box.hidden = false
}

function onRelocate(location: Relocation) {
  const { fraction, cfi, tocItem } = location
  const percent = Math.round(fraction * 100)
  $('progress-fill').style.width = `${fraction * 100}%`
  $('progress-label').textContent = tocItem?.label ? `${percent}% · ${tocItem.label}` : `${percent}%`
  if (tocItem?.href) tocView?.setCurrentHref(tocItem.href)
  scheduleSave({ cfi, fraction })
}

// ---- Commands ---------------------------------------------------------------

const tocOpen = () => !$('toc').hidden

function onKey(e: KeyboardEvent) {
  const command = commandFor(e)
  if (!command) return
  // While the contents are open, arrows and Home/End move through the list.
  if (tocOpen() && !['toc', 'escape', 'fullscreen'].includes(command)) return
  e.preventDefault()
  run(command).catch(console.error)
}

async function run(command: Command) {
  switch (command) {
    case 'escape':
      return escape()
    case 'fullscreen':
      return appWindow.setFullscreen(!(await appWindow.isFullscreen()))
  }
  if (!book) return
  switch (command) {
    case 'left':
      return book.view.goLeft()
    case 'right':
      return book.view.goRight()
    case 'next':
      return book.view.next()
    case 'prev':
      return book.view.prev()
    case 'lineDown':
      return book.lineDown()
    case 'lineUp':
      return book.lineUp()
    case 'chapterStart':
      return book.goToChapterEdge(0)
    case 'chapterEnd':
      return book.goToChapterEdge(1)
    case 'toc':
      return tocOpen() ? closeToc() : openToc()
    case 'toggleFlow':
      return toggleFlow()
  }
}

async function escape() {
  if (!$('footnote').hidden) book?.hideFootnote()
  else if (tocOpen()) closeToc()
  else if (await appWindow.isFullscreen()) await appWindow.setFullscreen(false)
}

async function toggleFlow() {
  if (!book) return
  book.flow = book.flow === 'paginated' ? 'scrolled' : 'paginated'
  settings = { ...settings, bookFlow: book.flow }
  updateFlowButton()
  await invoke('set_settings', { settings })
}

function updateFlowButton() {
  $('flow-button').textContent = book?.flow === 'scrolled' ? 'Paginated' : 'Scrolled'
}

function openToc() {
  $('scrim').hidden = false
  $('toc').hidden = false
  const current = $('toc-tree').querySelector<HTMLElement>('[aria-current]')
  ;(current ?? $('toc-tree').querySelector<HTMLElement>('[role="treeitem"]'))?.focus()
}

function closeToc() {
  $('scrim').hidden = true
  $('toc').hidden = true
}

// ---- Edge controls ----------------------------------------------------------

let hideTopbarTimer: number | undefined

function onPointer(y: number) {
  const topbar = $('topbar')
  if (!book) return
  if (y < TOP_EDGE_PX) {
    clearTimeout(hideTopbarTimer)
    topbar.classList.add('shown')
  } else if (topbar.classList.contains('shown') && !topbar.matches(':hover')) {
    clearTimeout(hideTopbarTimer)
    hideTopbarTimer = window.setTimeout(() => topbar.classList.remove('shown'), 600)
  }
}

// ---- Wiring -----------------------------------------------------------------

document.addEventListener('keydown', onKey)
document.addEventListener('mousemove', e => onPointer(e.clientY))
$('scrim').addEventListener('click', closeToc)
$('toc-button').addEventListener('click', () => run('toc'))
$('flow-button').addEventListener('click', () => run('toggleFlow'))
$('fullscreen-button').addEventListener('click', () => run('fullscreen'))
$('progress').addEventListener('click', e => {
  book?.view.goToFraction(e.clientX / innerWidth).catch(console.error)
})

appWindow.listen('book-changed', () => openCurrentBook())
appWindow.onCloseRequested(async () => {
  try {
    await flushSave()
  } catch (e) {
    console.error(e)
  }
})

invoke<Settings>('get_settings')
  .then(s => (settings = s))
  .catch(console.error)
  .finally(openCurrentBook)
