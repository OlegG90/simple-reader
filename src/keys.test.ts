import { describe, expect, it } from 'vitest'
import { commandFor } from './keys'

const key = (k: string, mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
  commandFor({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods })

describe('commandFor', () => {
  it('maps page turning keys', () => {
    expect(key('ArrowRight')).toBe('right')
    expect(key('PageDown')).toBe('next')
    expect(key(' ')).toBe('next')
    expect(key(' ', { shiftKey: true })).toBe('prev')
  })

  it('maps appearance shortcuts', () => {
    expect(key('s')).toBe('settings')
    expect(key(',', { ctrlKey: true })).toBe('settings')
    expect(key('D')).toBe('cycleTheme')
    expect(key('=', { ctrlKey: true })).toBe('fontBigger')
    expect(key('+', { ctrlKey: true })).toBe('fontBigger')
    expect(key('-', { ctrlKey: true })).toBe('fontSmaller')
  })

  it('maps window shortcuts', () => {
    expect(key('o', { ctrlKey: true })).toBe('open')
    expect(key('W', { ctrlKey: true, shiftKey: true })).toBe('closeWindow')
    expect(key('F5')).toBe('reload')
  })

  it('leaves other combinations to the browser', () => {
    expect(key('s', { ctrlKey: true })).toBeNull()
    expect(key('ArrowRight', { altKey: true })).toBeNull()
    expect(key('x')).toBeNull()
  })
})
