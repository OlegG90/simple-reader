import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { bookCss, nextTheme, readAppearance, stepFontSize, type Appearance } from './appearance'
import { commandFor, type Command } from './keys'
import { BookView, type Flow, type Relocation } from './reader'
import { createSettingsPanel } from './settings-panel'
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

interface Settings extends Appearance {
  bookFlow: Flow
  savePositions: boolean
}

function readSettings(stored: Record<string, unknown>): Settings {
  return {
    ...readAppearance(stored),
    bookFlow: stored.bookFlow === 'scrolled' ? 'scrolled' : 'paginated',
    savePositions: stored.savePositions !== false,
  }
}

const SAVE_DELAY_MS = 500
const TOP_EDGE_PX = 48

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const appWindow = getCurrentWindow()
const topbar = $('topbar')

const settingsLoaded = invoke<Record<string, unknown>>('get_settings')
  .catch(e => {
    console.error(e)
    return {}
  })
  .then(readSettings)
let settings: Settings = readSettings({})
let currentTocHref: string | undefined
let book: BookView | null = null
let fingerprint = ''
let tocView: { element: HTMLElement; setCurrentHref(href: string): void } | null = null

// ---- Reading position -------------------------------------------------------

let pendingSave: PendingSave | null = null
let saveTimer: number | undefined

function scheduleSave(save: PendingSave) {
  if (!settings.savePositions) return
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
    book = await BookView.open($('stage'), $('footnote'), file, {
      flow: settings.bookFlow,
      lastLocation: info.position?.cfi,
      css: currentBookCss(),
      columnWidth: settings.columnWidth,
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
    closePanels()
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
  closePanels()
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
const settingsOpen = () => !$('settings').hidden

/** Commands that still work while a side panel has the keyboard. */
const PANEL_COMMANDS: Command[] = ['toc', 'settings', 'escape', 'fullscreen', 'cycleTheme', 'fontBigger', 'fontSmaller']

function onKey(e: KeyboardEvent) {
  const command = commandFor(e)
  if (!command) return
  // While a panel is open, arrows, Home/End and so on work its controls.
  if ((tocOpen() || settingsOpen()) && !PANEL_COMMANDS.includes(command)) return
  e.preventDefault()
  runCommand(command).catch(console.error)
}

async function runCommand(command: Command) {
  switch (command) {
    case 'escape':
      return handleEscape()
    case 'fullscreen':
      return appWindow.setFullscreen(!(await appWindow.isFullscreen()))
    case 'settings':
      return settingsOpen() ? closePanels() : openSettings()
    case 'cycleTheme':
      return changeSettings({ theme: nextTheme(settings.theme) })
    case 'fontBigger':
      return changeSettings({ fontSize: stepFontSize(settings.fontSize, 1) })
    case 'fontSmaller':
      return changeSettings({ fontSize: stepFontSize(settings.fontSize, -1) })
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
      return tocOpen() ? closePanels() : openToc()
    case 'toggleFlow':
      return toggleFlow()
  }
}

async function handleEscape() {
  if (!$('footnote').hidden) book?.hideFootnote()
  else if (tocOpen() || settingsOpen()) closePanels()
  else if (await appWindow.isFullscreen()) await appWindow.setFullscreen(false)
}

async function toggleFlow() {
  if (!book) return
  book.flow = book.flow === 'paginated' ? 'scrolled' : 'paginated'
  updateFlowButton()
  await changeSettings({ bookFlow: book.flow })
}

function updateFlowButton() {
  $('flow-button').textContent = book?.flow === 'scrolled' ? 'Paginated' : 'Scrolled'
}

function openToc() {
  closePanels()
  $('scrim').hidden = false
  $('toc').hidden = false
  const current = $('toc-tree').querySelector<HTMLElement>('[aria-current]')
  ;(current ?? $('toc-tree').querySelector<HTMLElement>('[role="treeitem"]'))?.focus()
}

/** Settings open without the scrim, so changes show on the book right away. */
function openSettings() {
  closePanels()
  settingsPanel.show(settings)
  $('settings').hidden = false
  $('settings').querySelector<HTMLElement>('button, select, input')?.focus()
}

function closePanels() {
  $('scrim').hidden = true
  $('toc').hidden = true
  $('settings').hidden = true
}

// ---- Settings and appearance ------------------------------------------------

const systemDark = matchMedia('(prefers-color-scheme: dark)')
const settingsPanel = createSettingsPanel($('settings'), changes => void changeSettings(changes))

/** Sets the app theme; "system" resolves to light or dark. */
function applyTheme() {
  const { theme } = settings
  document.documentElement.dataset.theme = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme
}

/** The book is drawn with the app theme's colours, so the two always match. */
function currentBookCss() {
  const root = getComputedStyle(document.documentElement)
  return bookCss(settings, {
    scheme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    text: root.getPropertyValue('--fg').trim(),
    link: root.getPropertyValue('--link').trim(),
  })
}

function restyle() {
  applyTheme()
  book?.setAppearance(currentBookCss(), settings.columnWidth)
  if (settingsOpen()) settingsPanel.show(settings)
}

async function changeSettings(changes: Partial<Settings>) {
  settings = { ...settings, ...changes }
  restyle()
  await invoke('update_settings', { changes }).catch(console.error)
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
$('scrim').addEventListener('click', closePanels)
$('toc-button').addEventListener('click', () => runCommand('toc'))
$('settings-button').addEventListener('click', () => runCommand('settings'))
$('flow-button').addEventListener('click', () => runCommand('toggleFlow'))
$('fullscreen-button').addEventListener('click', () => runCommand('fullscreen'))
$('progress').addEventListener('click', e => {
  book?.view.goToFraction(e.clientX / innerWidth).catch(console.error)
})

appWindow.listen('book-changed', () => openCurrentBook())
// flushSave never throws, so a failed save cannot keep the window open.
appWindow.onCloseRequested(flushSave)
systemDark.addEventListener('change', () => settings.theme === 'system' && restyle())

applyTheme()
settingsLoaded.then(loaded => {
  settings = loaded
  applyTheme()
  return openCurrentBook()
})
