// @vitest-environment jsdom
/// <reference types="node" />
import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Guards the FB2 requirements that rely on the vendored foliate-js parser.
// jsdom lacks Document.xmlEncoding, so these exercise fb2.js's fallback that
// reads the encoding from the XML declaration; WebView2 has both paths.

let fb2: typeof import('./vendor/foliate-js/fb2.js')
let view: typeof import('./vendor/foliate-js/view.js')
const { createObjectURL } = URL

beforeAll(async () => {
  // jsdom has no object URLs; fb2.js creates one for its stylesheet on import.
  URL.createObjectURL = () => 'blob:stub'
  fb2 = await import('./vendor/foliate-js/fb2.js')
  view = await import('./vendor/foliate-js/view.js')
})

afterAll(() => {
  URL.createObjectURL = createObjectURL
})

const sample = (name: string) => new File([readFileSync(resolve(import.meta.dirname, '../samples', name))], name)

const minimalFB2 = (declaration: string, title: string) =>
  new File(
    [
      `${declaration}<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">` +
        `<description><title-info><book-title>${title}</book-title></title-info></description>` +
        `<body><section><p>Text</p></section></body></FictionBook>`,
    ],
    'minimal.fb2',
  )

describe('FB2', () => {
  it('decodes windows-1251 using the XML declaration', async () => {
    const book = await fb2.makeFB2(sample('sample-windows-1251.fb2'))
    expect(book.metadata.title).toBe('Зразок: Містечко над річкою')
    expect(book.metadata.language).toBe('uk')
    expect(book.toc.map((item: { label: string }) => item.label)).toContain('Розділ 1. Ранок')
  })

  it('reads UTF-8 when there is no XML declaration', async () => {
    const book = await fb2.makeFB2(minimalFB2('', 'Без декларації'))
    expect(book.metadata.title).toBe('Без декларації')
  })

  it('opens a zipped UTF-8 book (.fb2.zip)', async () => {
    const book = await view.makeBook(sample('sample-utf8.fb2.zip'))
    expect(book.metadata?.title).toBe('Sample: The Lighthouse')
  })
})
