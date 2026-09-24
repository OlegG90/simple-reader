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
  fingerprint: string
  position: Position | null
}

interface PendingSave {
  fingerprint: string
  position: Position
}

type Settings = { bookFlow?: Flow } & Record<string, unknown>

const SAVE_DELAY_MS = 500
const TOP_EDGE_PX = 48

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const appWindow = getCurrentWindow()
const topbar = $('topbar')

// Loaded alongside the first book rather than before it.
const settingsLoaded = invoke<Settings>('get_settings').catch(e => {
  console.error(e)
  return {}
})
let settings: Settings = {}
let currentTocHref: string | undefined
let book: BookView | null = null
let fingerprint = ''
let tocView: { element: HTMLElement; setCurrentHref(href: string): void } | null = null

// ---- Reading position -------------------------------------------------------

let pendingSave: PendingSave | null = null
let saveTimer: number | undefined

function scheduleSave(save: PendingSave) {
  pendingSave = save
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flushSave, SAVE_DELAY_MS)
}

async function flushSave() {
  clearTimeout(saveTimer)
  const save = pendingSave
  pendingSave = null
  if (save) await invoke('save_position', { ...save }).catch(console.error)
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
    fingerprint = info.fingerprint
    const bytes = await invoke<ArrayBuffer>('read_book')
    // foliate-js detects some formats by extension, so normalise its case.
    const file = new File([bytes], info.fileName.toLowerCase())
    settings = await settingsLoaded
    book = await BookView.open($('stage'), $('footnote'), file, {
      flow: settings.bookFlow ?? 'paginated',
      lastLocation: info.position?.cfi,
    }, {
      relocate: onRelocate,
      key: onKey,
      pointer: onPointer,
      externalLink: href => void openUrl(href).catch(console.error),
    })
  } catch (e) {
    showError(info?.fileName, e)
    return
  }
  const title = book.title || info.fileName
  void appWindow.setTitle(title).catch(console.error)
  $('toc-title').textContent = title
  $('toc-author').textContent = book.author
  tocView = createTOCView(book.toc, (href: string) => {
    book?.view.goTo(href).catch(console.error)
    closeToc()
  })
  $('toc-tree').replaceChildren(tocView.element)
  currentTocHref = undefined
  highlightToc(book.view.lastLocation?.tocItem?.href)
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
  topbar.classList.remove('shown')
}

function showError(fileName: string | undefined, error: unknown) {
  const box = $('error')
  const title = document.createElement('p')
  title.textContent = fileName ? `Can't open “${fileName}”` : "Can't open the book"
  const detail = document.createElement('p')
  detail.className = 'muted'
  const message = error instanceof Error ? error.message : String(error)
  detail.textContent = message || 'The file is damaged or in an unsupported format'
  box.replaceChildren(title, detail)
  box.hidden = false
}

function onRelocate(location: Relocation) {
  const { fraction, cfi, tocItem } = location
  const percent = Math.round(fraction * 100)
  $('progress-fill').style.width = `${fraction * 100}%`
  $('progress-label').textContent = tocItem?.label ? `${percent}% · ${tocItem.label}` : `${percent}%`
  highlightToc(tocItem?.href)
  scheduleSave({ fingerprint, position: { cfi, fraction } })
}

function highlightToc(href: string | undefined) {
  if (!href || href === currentTocHref) return
  currentTocHref = href
  tocView?.setCurrentHref(href)
}

// ---- Commands ---------------------------------------------------------------

const tocOpen = () => !$('toc').hidden

function onKey(e: KeyboardEvent) {
  const command = commandFor(e)
  if (!command) return
  // While the contents are open, arrows and Home/End move through the list.
  if (tocOpen() && !['toc', 'escape', 'fullscreen'].includes(command)) return
  e.preventDefault()
  runCommand(command).catch(console.error)
}

async function runCommand(command: Command) {
  switch (command) {
    case 'escape':
      return handleEscape()
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
      return book.goToChapterEdge('start')
    case 'chapterEnd':
      return book.goToChapterEdge('end')
    case 'toc':
      return tocOpen() ? closeToc() : openToc()
    case 'toggleFlow':
      return toggleFlow()
  }
}

async function handleEscape() {
  if (!$('footnote').hidden) book?.hideFootnote()
  else if (tocOpen()) closeToc()
  else if (await appWindow.isFullscreen()) await appWindow.setFullscreen(false)
}

async function toggleFlow() {
  if (!book) return
  book.flow = book.flow === 'paginated' ? 'scrolled' : 'paginated'
  settings = { ...settings, bookFlow: book.flow }
  updateFlowButton()
  await invoke('update_settings', { changes: { bookFlow: book.flow } })
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
$('toc-button').addEventListener('click', () => runCommand('toc'))
$('flow-button').addEventListener('click', () => runCommand('toggleFlow'))
$('fullscreen-button').addEventListener('click', () => runCommand('fullscreen'))
$('progress').addEventListener('click', e => {
  book?.view.goToFraction(e.clientX / innerWidth).catch(console.error)
})

appWindow.listen('book-changed', () => openCurrentBook())
// flushSave never throws, so a failed save cannot keep the window open.
appWindow.onCloseRequested(flushSave)

openCurrentBook()
