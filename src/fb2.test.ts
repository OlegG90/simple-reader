// @vitest-environment jsdom
import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

// Guards the FB2 requirements that rely on the vendored foliate-js parser.

let fb2: typeof import('./vendor/foliate-js/fb2.js')
let view: typeof import('./vendor/foliate-js/view.js')

beforeAll(async () => {
  // jsdom has no object URLs; fb2.js creates one for its stylesheet on import.
  URL.createObjectURL = () => 'blob:stub'
  fb2 = await import('./vendor/foliate-js/fb2.js')
  view = await import('./vendor/foliate-js/view.js')
})

const sample = (name: string) => new File([readFileSync(`samples/${name}`)], name)

describe('FB2', () => {
  it('decodes windows-1251 using the XML declaration', async () => {
    const book = await fb2.makeFB2(sample('sample-windows-1251.fb2'))
    expect(book.metadata.title).toBe('Зразок: Містечко над річкою')
    expect(book.metadata.language).toBe('uk')
    expect(book.toc.map((item: { label: string }) => item.label)).toContain('Розділ 1. Ранок')
  })

  it('opens a zipped UTF-8 book (.fb2.zip)', async () => {
    const book = await view.makeBook(sample('sample-utf8.fb2.zip'))
    expect(book.metadata?.title).toBe('Sample: The Lighthouse')
  })
})
