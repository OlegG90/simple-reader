# Simple Reader

A minimal, portable e-book reader for Windows. It reads — and does nothing else.

- Formats: EPUB, FB2 (`.fb2`, `.fb2.zip`), Markdown
- Paginated or scrolled reading, table of contents, footnote pop-ups
- Remembers your place in every book
- A single `sreader.exe` — no installer

## Download

Take `sreader-x64.exe` (most PCs) or `sreader-arm64.exe` (Windows on ARM, e.g. Snapdragon) from the
[latest release](https://github.com/OlegG90/simple-reader/releases/latest), rename it to `sreader.exe`
and put it in a folder you keep. Settings and reading positions are stored in `sreader.json` next to it
(or in `%APPDATA%\simple-reader` if that folder is read-only). To open books by double-click, run
`sreader --register` once from that folder; run it again if you move the exe.

## Usage

```
sreader book.epub            # open a book (each file gets its own window)
sreader                      # start screen with recent books
sreader --no-save book.fb2   # just take a look: don't remember the position
sreader --register           # offer Simple Reader for .epub, .fb2, .fbz and .md (current user)
sreader --help
```

In the app: `←`/`→` turn pages, `T` contents, `S` settings, `M` paginated/scrolled, `D` theme,
`Ctrl+O` open, `Ctrl+W` close, `F11` full screen, `Esc` close a panel.

The exe is not code-signed, so on first run Windows SmartScreen may ask: choose "More info" → "Run anyway".

See [docs/spec.md](docs/spec.md) for the full specification.

## Development

Requires Node.js, Rust (MSVC toolchain) and Visual Studio Build Tools with the C++ workload
(plus the ARM64 or x64 build tools to build for the other architecture).

```
npm install
npx tauri dev -- -- samples/alice-in-wonderland.epub  # dev mode with a sample book
npm test                 # frontend (vitest) and backend unit tests
npm run build            # this machine's architecture: src-tauri/target/release/sreader.exe
npm run build:x64        # src-tauri/target/x86_64-pc-windows-msvc/release/sreader.exe
npm run build:arm64      # src-tauri/target/aarch64-pc-windows-msvc/release/sreader.exe
```

For the other architecture, add the Rust target first: `rustup target add x86_64-pc-windows-msvc`
(or `aarch64-pc-windows-msvc`).

### Releases

Pushing a tag `vX.Y.Z` that matches the version in `src-tauri/Cargo.toml` runs
[the release workflow](.github/workflows/release.yml): tests, both builds, and a GitHub Release with
`sreader-x64.exe` and `sreader-arm64.exe`. Running the workflow by hand builds the same two files as an
artifact without publishing anything.

The app icon is generated from [src-tauri/icons/app-icon.svg](src-tauri/icons/app-icon.svg) with
`npx tauri icon src-tauri/icons/app-icon.svg -o src-tauri/icons` (then delete the non-Windows files).

Sample books are in [samples/](samples/): public-domain EPUBs from Project Gutenberg, FB2 files
(windows-1251 and a UTF-8 `.fb2.zip`) generated from original text by `python scripts/make-fb2-samples.py`,
and `sample.md` with a local image.

## License

[MIT](LICENSE)
