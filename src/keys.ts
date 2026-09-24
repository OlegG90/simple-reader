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
  | 'fullscreen'
  | 'escape'

type Key = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>

/** Maps a key press to a reader command; `null` leaves it to the browser. */
export function commandFor(e: Key): Command | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  switch (e.key) {
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
    case 'T':
      return 'toc'
    case 'm':
    case 'M':
      return 'toggleFlow'
    case 'F11':
      return 'fullscreen'
    case 'Escape':
      return 'escape'
  }
  return null
}
