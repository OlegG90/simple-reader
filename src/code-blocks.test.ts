// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CODE_ATTR, DIAGRAM_ATTR, highlightCode, renderDiagrams } from './code-blocks'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const toUrl = () => 'blob:diagram'

describe('renderDiagrams', () => {
  it('replaces mermaid blocks with images of the diagram', async () => {
    const doc = parse('<pre><code class="language-mermaid">flowchart LR\n  A --&gt; B</code></pre>')
    const sources: string[] = []
    await renderDiagrams(doc, async source => (sources.push(source), '<svg/>'), toUrl)
    expect(sources).toEqual(['flowchart LR\n  A --> B'])
    expect(doc.querySelector('pre')).toBeNull()
    const img = doc.querySelector('img')!
    expect(img.hasAttribute(DIAGRAM_ATTR)).toBe(true)
    expect(img.getAttribute('src')).toBe('blob:diagram')
  })

  it('keeps a block that fails to render as code, and leaves other code alone', async () => {
    const doc = parse('<pre><code class="language-mermaid">nonsense</code></pre><pre><code class="language-js">x</code></pre>')
    await renderDiagrams(doc, () => Promise.reject(new Error('Parse error')), toUrl)
    expect(doc.querySelectorAll('pre')).toHaveLength(2)
    expect(doc.querySelector('img')).toBeNull()
  })
})

describe('highlightCode', () => {
  it('highlights code in a known language', async () => {
    const doc = parse('<pre><code class="language-JS">const a = "&lt;b&gt;"</code></pre>')
    await highlightCode(doc)
    const code = doc.querySelector('code')!
    expect(code.hasAttribute(CODE_ATTR)).toBe(true)
    expect(code.querySelector('.hljs-keyword')?.textContent).toBe('const')
    expect(code.textContent).toBe('const a = "<b>"')
    expect(code.querySelector('b')).toBeNull()
  })

  it('knows PowerShell', async () => {
    const doc = parse('<pre><code class="language-ps1">Get-ChildItem</code></pre>')
    await highlightCode(doc)
    expect(doc.querySelector('.hljs-built_in')?.textContent).toBe('Get-ChildItem')
  })

  it('leaves unknown languages, unlabelled blocks and inline code plain', async () => {
    const html = '<pre><code class="language-nope">a &lt; b</code></pre><pre><code>x</code></pre><p><code>y</code></p>'
    const doc = parse(html)
    await highlightCode(doc)
    expect(doc.querySelector(`[${CODE_ATTR}]`)).toBeNull()
    expect(doc.body.innerHTML).toBe(html)
  })
})
