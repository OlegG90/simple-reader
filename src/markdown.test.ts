import { describe, expect, it } from 'vitest'
import { headingsToToc, isLocalPath, isMarkdown, renderMarkdown, stripFrontMatter } from './markdown'

describe('stripFrontMatter', () => {
  it('removes a leading YAML block', () => {
    expect(stripFrontMatter('---\ntitle: x\ntags: [a]\n---\n# Hello\n')).toBe('# Hello\n')
    expect(stripFrontMatter('﻿---\r\ntitle: x\r\n...\r\ntext')).toBe('text')
  })

  it('leaves documents without front matter alone', () => {
    const text = '# Title\n\n---\n\nAfter a rule\n'
    expect(stripFrontMatter(text)).toBe(text)
  })
})

describe('renderMarkdown', () => {
  it('renders GitHub-flavored tables, task lists and strikethrough', () => {
    const { html } = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~old~~')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
    expect(html).toMatch(/<input[^>]*checked[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*checked/)
    expect(html).toContain('<del>old</del>')
  })

  it('keeps code blocks plain', () => {
    const { html } = renderMarkdown('```js\nconst a = 1 < 2\n```')
    expect(html).toContain('<pre><code class="language-js">const a = 1 &lt; 2\n</code></pre>')
  })

  it('gives headings unique ids and collects H1–H3 for the contents', () => {
    const { html, headings, title } = renderMarkdown(
      '---\ntitle: ignored\n---\n# Guide **One**\n## Setup\n### Setup\n#### Deep\n## Розділ 2\n',
    )
    expect(title).toBe('Guide One')
    expect(headings).toEqual([
      { level: 1, text: 'Guide One', id: 'guide-one' },
      { level: 2, text: 'Setup', id: 'setup' },
      { level: 3, text: 'Setup', id: 'setup-1' },
      { level: 2, text: 'Розділ 2', id: 'розділ-2' },
    ])
    expect(html).toContain('<h4 id="deep">Deep</h4>')
    expect(html).not.toContain('ignored')
  })

  it('never repeats an id, even when a heading looks like a numbered duplicate', () => {
    const { headings } = renderMarkdown('## Setup\n## Setup\n## Setup 1\n')
    expect(headings.map(h => h.id)).toEqual(['setup', 'setup-1', 'setup-1-1'])
  })
})

describe('headingsToToc', () => {
  it('nests headings by level', () => {
    const toc = headingsToToc([
      { level: 1, text: 'A', id: 'a' },
      { level: 2, text: 'A.1', id: 'a1' },
      { level: 3, text: 'A.1.1', id: 'a11' },
      { level: 2, text: 'A.2', id: 'a2' },
      { level: 1, text: 'B', id: 'b' },
    ])
    expect(toc).toEqual([
      {
        label: 'A',
        href: '#a',
        subitems: [
          { label: 'A.1', href: '#a1', subitems: [{ label: 'A.1.1', href: '#a11' }] },
          { label: 'A.2', href: '#a2' },
        ],
      },
      { label: 'B', href: '#b' },
    ])
  })

  it('handles documents that start below H1', () => {
    expect(headingsToToc([{ level: 2, text: 'X', id: 'x' }, { level: 3, text: 'Y', id: 'y' }])).toEqual([
      { label: 'X', href: '#x', subitems: [{ label: 'Y', href: '#y' }] },
    ])
  })
})

describe('file and path checks', () => {
  it('recognises Markdown files', () => {
    expect(isMarkdown('Notes.MD')).toBe(true)
    expect(isMarkdown('book.epub')).toBe(false)
  })

  it('tells local image paths from URLs', () => {
    expect(isLocalPath('images/a.png')).toBe(true)
    expect(isLocalPath('../a b.png')).toBe(true)
    expect(isLocalPath('https://x/a.png')).toBe(false)
    expect(isLocalPath('data:image/png;base64,AA')).toBe(false)
    expect(isLocalPath('//cdn/a.png')).toBe(false)
    expect(isLocalPath('')).toBe(false)
  })
})
