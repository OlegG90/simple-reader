# Simple Reader

A minimal, portable e-book reader for Windows. It reads — and does nothing else.

- Formats: EPUB, FB2 (`.fb2`, `.fb2.zip`), Markdown
- Paginated or scrolled reading, table of contents, footnote pop-ups
- Remembers your place in every book
- A single `sreader.exe` — no installer

```
sreader book.epub
```

See [docs/spec.md](docs/spec.md) for the full specification.

## Status

Early development.

## Development

Requires Node.js, Rust (MSVC toolchain) and Visual Studio Build Tools with the C++ workload.

```
npm install
npx tauri dev -- -- samples/alice-in-wonderland.epub  # dev mode with a sample book
npm test                                          # frontend (vitest) and backend unit tests
npm run build                                     # src-tauri/target/release/sreader.exe
```

Sample books are in [samples/](samples/): public-domain EPUBs from Project Gutenberg, and FB2 files
(windows-1251 and a UTF-8 `.fb2.zip`) generated from original text by `python scripts/make-fb2-samples.py`.

## License

[MIT](LICENSE)
