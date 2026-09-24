import { describe, expect, it } from 'vitest'
import { pageLabels } from './pages'

describe('pageLabels', () => {
  it('numbers single-column pages within the chapter', () => {
    expect(pageLabels({ screen: 1, screens: 12, columns: 1 })).toEqual(['1 / 12'])
    expect(pageLabels({ screen: 12, screens: 12, columns: 1 })).toEqual(['12 / 12'])
  })

  it('numbers both pages of a two-column spread', () => {
    expect(pageLabels({ screen: 3, screens: 9, columns: 2 })).toEqual(['5 / 18', '6 / 18'])
  })

  it('uses the measured page count when the last spread is half empty', () => {
    expect(pageLabels({ screen: 9, screens: 9, columns: 2, textColumns: 17 })).toEqual(['17 / 17', ''])
  })

  it('shows nothing on the blank screens around a chapter or without text', () => {
    expect(pageLabels({ screen: 0, screens: 5, columns: 2 })).toEqual(['', ''])
    expect(pageLabels({ screen: 6, screens: 5, columns: 1 })).toEqual([''])
    expect(pageLabels({ screen: 1, screens: 0, columns: 1 })).toEqual([''])
  })
})
