// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { makeMarkdownBook } from './markdown-book'

const noImages = () => Promise.reject(new Error('no images in this test'))

beforeAll(() => {
  // jsdom has no object URLs.
  URL.createObjectURL = () => 'blob:stub'
  URL.revokeObjectURL = () => {}
})

describe('makeMarkdownBook', () => {
  it('strips code from raw HTML', async () => {
    const source = [
      '# Title',
      '<script src="/assets/app.js"></script>',
      '<iframe src="https://example.com"></iframe>',
      '<img src="x.png" onerror="alert(1)">',
      '[bad](javascript:alert(1))',
    ].join('\n\n')
    const book = await makeMarkdownBook(source, 'a.md', noImages)
    const html = (await book.sections[0].createDocument()).documentElement.outerHTML
    expect(html).not.toMatch(/<script|<iframe|onerror|javascript:/i)
    expect(html).toContain('<h1 id="title">Title</h1>')
  })

  it('keeps heading links inside the file and sends everything else out', async () => {
    const book = await makeMarkdownBook('# A\n## B', 'a.md', noImages)
    expect(book.isExternal('#b')).toBe(false)
    expect(book.isExternal('https://example.com')).toBe(true)
    expect(book.isExternal('other.md#b')).toBe(true)
    expect(book.resolveHref('#100%').index).toBe(0)
    expect(book.toc).toEqual([{ label: 'A', href: '#a', subitems: [{ label: 'B', href: '#b' }] }])
  })

  it('titles the book with its first heading, or the file name', async () => {
    expect((await makeMarkdownBook('# Guide\ntext', 'a.md', noImages)).metadata.title).toBe('Guide')
    expect((await makeMarkdownBook('just text', 'notes.md', noImages)).metadata.title).toBe('notes.md')
  })
})
