export type Command =
  | 'left'
  | 'right'
  | 'next'
  | 'prev'
  | 'lineDown'
  | 'lineUp'
  | 'chapterStart'
  | 'chapterEnd'
  | 'toc'
  | 'toggleFlow'
  | 'settings'
  | 'cycleTheme'
  | 'fontBigger'
  | 'fontSmaller'
  | 'fullscreen'
  | 'reload'
  | 'escape'

type Key = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>

/** Maps a key press to a reader command; `null` leaves it to the browser. */
export function commandFor(e: Key): Command | null {
  if (e.altKey || e.metaKey) return null
  if (e.ctrlKey) {
    switch (e.key) {
      case '=':
      case '+':
        return 'fontBigger'
      case '-':
        return 'fontSmaller'
      case ',':
        return 'settings'
    }
    return null
  }
  // Letters work with or without Shift / Caps Lock.
  switch (e.key.length === 1 ? e.key.toLowerCase() : e.key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowDown':
      return 'lineDown'
    case 'ArrowUp':
      return 'lineUp'
    case 'PageDown':
      return 'next'
    case 'PageUp':
      return 'prev'
    case ' ':
      return e.shiftKey ? 'prev' : 'next'
    case 'Home':
      return 'chapterStart'
    case 'End':
      return 'chapterEnd'
    case 't':
      return 'toc'
    case 'm':
      return 'toggleFlow'
    case 's':
      return 'settings'
    case 'd':
      return 'cycleTheme'
    case 'F11':
      return 'fullscreen'
    case 'F5':
      return 'reload'
    case 'Escape':
      return 'escape'
  }
  return null
}
