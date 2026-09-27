// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { standaloneSvg } from './mermaid'

describe('standaloneSvg', () => {
  it('turns inline markup into well-formed XML with its own size', () => {
    const markup =
      '<svg id="d" width="100%" style="max-width: 300px;" viewBox="-8 -8 300 120">' +
      '<foreignObject><div>A<br>B</div></foreignObject></svg>'
    const { svg: xml, width } = standaloneSvg(markup)
    expect(width).toBe(300 / 16)
    const svg = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement
    expect(svg.querySelector('parsererror')).toBeNull()
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(svg.getAttribute('width')).toBe('300')
    expect(svg.getAttribute('height')).toBe('120')
    expect(svg.hasAttribute('style')).toBe(false)
    expect(xml).toContain('<br />')
  })

  it('fails when there is no diagram, or it has no size', () => {
    expect(() => standaloneSvg('<p>oops</p>')).toThrow()
    expect(() => standaloneSvg('<svg width="100%"></svg>')).toThrow()
  })
})
