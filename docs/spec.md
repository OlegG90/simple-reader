# Simple Reader — Specification

A personal, minimal e-book reader for Windows 11. The guiding principle: **reading only**. Anything that is not reading stays out.

## Product

| | |
|---|---|
| Display name | Simple Reader |
| Executable / CLI | `sreader.exe` |
| Repository / data folder | `simple-reader` |
| Platform | Windows 11 (WebView2 is part of the OS) |
| UI language | English only |
| Distribution | A single portable `sreader.exe`: no installer, not code-signed, no auto-update |
| License | MIT |

### Supported formats

- `.epub`
- `.fb2` and `.fb2.zip` — FB2 files in UTF-8 and windows-1251 (encoding taken from the XML declaration)
- `.md` — GitHub-flavored Markdown

### Out of scope

Bookmarks, highlights and notes, full-text search, dictionary / translation, text-to-speech, sync, format conversion, metadata editing, DRM-protected books, a library / bookshelf, tabs, terminal (TUI) reading, PDF, MOBI/AZW3, TXT.

## Reading

### Modes

- **Paginated** and **scrolled**, toggled with `M`.
- The mode is remembered separately per content type: books default to paginated, Markdown defaults to scrolled. `M` toggles the mode for the current type.
- In paginated mode, windows wider than ~1400 px show two columns.

### Appearance (global settings, not per book)

| Setting | Default |
|---|---|
| Theme | Follow Windows (light / dark); manual choice of light, dark, sepia |
| Font | Georgia (choices: Georgia, Cambria, Segoe UI, Calibri, Publisher default) |
| Font size | 19 px (12–36) |
| Line height | 1.5 (1.2–2.2) |
| Line length | ~70 characters (45–100); the column width follows the font size |

Justified text with hyphenation is always on (hyphenation works for the languages WebView2 supports).

Only system fonts are used — no fonts are bundled. The chosen font applies to text blocks; code and inline elements the book styles itself (monospace, drop caps) keep their fonts.

In the light theme books keep their own colours; dark and sepia repaint all text in the theme's colours. The app and the book always use the same theme colours, and the saved theme is applied before the window first paints.

### Navigation

- Table of contents (`T`), shown on demand.
- A thin progress bar at the bottom; clicking it jumps to that position.
- Keyboard, mouse wheel, and clicking the left/right page edges.

### Footnotes and links

- Footnotes (FB2 and EPUB) open in a pop-up over the text.
- External (`http(s)`) links open in the default browser.

### Markdown

- GFM: tables, task lists, strikethrough.
- Images resolved relative to the `.md` file.
- Table of contents built from H1–H3.
- Code blocks in a monospace font, **no** syntax highlighting.
- YAML front matter is hidden.
- `F5` reloads the file manually; there is no automatic file watching.
- Links to headings stay in the file; web links open in the browser; links to other files are ignored.
- Raw HTML is allowed, but scripts, frames, embedded objects and event handlers are removed.

## Window

- Standard Windows frame; the title shows the book title.
- No permanent toolbar. Controls (TOC, settings, progress) appear when the mouse nears an edge or on a hotkey.
- `F11` toggles full screen.
- Window size and position are remembered.
- Each file launched from Explorer or the command line gets its own window. `Ctrl+O`, dropping a file and the recent list open the book in the current window.
- A book that is already open in a window is never opened twice: that window comes forward instead.
- Settings changed in one window apply to all open windows.

### Start screen

Launching without a file (`sreader`) shows an empty window with a "Drop a book here / Ctrl+O" hint and up to 10 recent books (title, author, % read). Missing files are shown greyed out and removed when clicked. Recent books appear only here — there is no separate menu.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `←` / `→`, `PgUp` / `PgDn`, `Space` / `Shift+Space` | Previous / next page |
| `Home` / `End` | Start / end of chapter |
| `T` | Table of contents |
| `S`, `Ctrl+,` | Settings |
| `M` | Toggle paginated / scrolled |
| `Ctrl+=` / `Ctrl+-` | Font size |
| `D` | Cycle theme |
| `F11` | Full screen |
| `F5` | Reload (Markdown) |
| `Ctrl+O` | Open file |
| `Ctrl+W` | Close window |
| `Esc` | Close panel / pop-up, leave full screen (never closes the app) |

### Errors

A corrupt or unsupported file shows a message in the window; the app does not crash.

## Command line

```
sreader [<file>] [--no-save] [--data-dir <path>]
sreader --register | --unregister
sreader --help | --version
```

| Option | Meaning |
|---|---|
| `<file>` | Open the file in a new window |
| `--no-save` | Do not save the reading position or add to the recent list for this window ("just take a look") |
| `--data-dir <path>` | Use an explicit data location |
| `--register` / `--unregister` | Add / remove file associations for `.epub`, `.fb2`, `.fbz`, `.md` under `HKCU` (no admin rights) |
| `--help` / `--version` | Print to the console the exe was launched from |

`--register` adds Simple Reader to "Open with" and makes it the default only where the user has no default yet; Windows keeps a choice made with "Open with → Always" out of reach of apps. `.fb2.zip` cannot be associated: Windows only looks at the last extension, and taking over `.zip` is not acceptable.

## Process model

A single process with many windows. Launching `sreader book2.fb2` while the app is running forwards the file to the running instance (single-instance), which opens a new window. One process owns all state, so there are no concurrent writes to the data file.

## State

- Stored in one JSON file: settings, reading positions, recent files, window geometry.
- **Location:** `sreader.json` next to the exe if that folder is writable; otherwise `%APPDATA%\simple-reader\sreader.json`. `--data-dir` overrides both.
- **Reading position** is saved automatically. A global setting turns saving off; `--no-save` turns it off for one window.
- **Book identity** is a content fingerprint (file size + hash of the start of the file), so the position survives moving or renaming the file. The path is stored separately, for the recent list only. Markdown files are identified by their full path instead, because editing them changes their content.
- **Markdown images** are read through the backend only when they are image files referenced relative to the `.md` file.

## Technology

- **Shell:** Tauri 2 (Rust) + WebView2.
- **Frontend:** plain TypeScript, no framework.
- **Rendering:** [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT) for EPUB and FB2; a Markdown parser for `.md`.
- **Plugins:** single-instance, CLI arguments, dialog.
- **Build:** Tauri bundling (MSI/NSIS) disabled; only `sreader.exe` is produced. `npm run build` builds it locally.
- **CI:** GitHub Actions builds `sreader.exe` for **ARM64 and x64** on `v*` tags and attaches both to the GitHub Release.
- **Icon:** a simple open-book icon (SVG → ICO), kept in the repo so it can be replaced.
- The exe is unsigned, so SmartScreen asks for confirmation on first run ("More info" → "Run anyway").

## Testing

- Automated tests cover the app's own logic: data-location selection, FB2 encoding detection, Markdown → HTML, CLI argument parsing, book fingerprinting.
- Rendering is checked by hand against sample files kept in the repo: public-domain EPUBs (Project Gutenberg), an FB2 in windows-1251, a `.fb2.zip`, and a `.md` file.

## Milestones

1. Scaffold + open EPUB + paginated / scrolled + position saving
2. FB2 / `.fb2.zip` / encodings
3. Appearance settings and themes
4. Markdown
5. CLI flags, `--register`, recent files, start screen
6. Portable exe build and release CI
