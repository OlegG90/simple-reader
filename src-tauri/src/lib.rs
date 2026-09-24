mod cli;
mod console;
mod data_dir;
mod fingerprint;
mod paths;
mod register;
mod store;

use cli::{Command, Launch};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use store::{Position, RecentBook, Store, WindowGeometry};
use tauri::ipc::Response;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};
use tauri_plugin_dialog::DialogExt;

const DEFAULT_WIDTH: f64 = 1100.0;
const DEFAULT_HEIGHT: f64 = 800.0;

/// What each reader window shows (its book and `--no-save`), by window label.
/// The frontend never passes file paths: it can only read the book the
/// backend assigned to its window, so book content cannot make the app read
/// arbitrary files.
#[derive(Default)]
struct ReaderWindows(Mutex<HashMap<String, Launch>>);

impl ReaderWindows {
    fn get(&self, label: &str) -> Launch {
        self.0.lock().unwrap().get(label).cloned().unwrap_or_default()
    }

    fn path_of(&self, label: &str) -> Result<PathBuf, String> {
        self.get(label).file.ok_or_else(|| "No book is open".into())
    }

    fn insert(&self, label: &str, launch: Launch) {
        self.0.lock().unwrap().insert(label.to_string(), launch);
    }

    fn remove(&self, label: &str) {
        self.0.lock().unwrap().remove(label);
    }

    fn set_path(&self, label: &str, path: PathBuf) {
        self.0.lock().unwrap().entry(label.to_string()).or_default().file = Some(path);
    }

    /// The window, other than `except`, already showing `path`.
    fn showing(&self, path: &Path, except: Option<&str>) -> Option<String> {
        let windows = self.0.lock().unwrap();
        windows
            .iter()
            .filter(|(label, _)| Some(label.as_str()) != except)
            .find(|(_, w)| w.file.as_deref().is_some_and(|file| paths::same_file(file, path)))
            .map(|(label, _)| label.clone())
    }
}

/// Brings forward the window (other than `except`) already showing `path`;
/// false when there is none.
fn focus_showing(app: &AppHandle, path: &Path, except: Option<&str>) -> bool {
    let Some(label) = app.state::<ReaderWindows>().showing(path, except) else { return false };
    let Some(window) = app.get_webview_window(&label) else { return false };
    let _ = window.unminimize();
    window.set_focus().is_ok()
}

/// Shows `path` in `window` and tells its frontend to load it, unless another
/// window already shows that book; then that window comes forward instead.
fn show_book(window: &Window, path: PathBuf) {
    if focus_showing(window.app_handle(), &path, Some(window.label())) {
        return;
    }
    window.state::<ReaderWindows>().set_path(window.label(), path);
    let _ = window.emit_to(window.label(), "book-changed", ());
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BookInfo {
    file_name: String,
    /// Markdown is rendered by the app itself; everything else by foliate-js.
    markdown: bool,
    fingerprint: String,
    position: Option<Position>,
    no_save: bool,
}

#[tauri::command(async)]
fn current_book(window: Window, windows: State<ReaderWindows>, store: State<Store>) -> Result<Option<BookInfo>, String> {
    let Launch { file: Some(path), no_save } = windows.get(window.label()) else {
        return Ok(None);
    };
    let file_name = paths::file_name(&path);
    let fingerprint = fingerprint::fingerprint(&path).map_err(|e| format!("{file_name}: {e}"))?;
    let position = store.read(|s| s.positions.get(&fingerprint).cloned());
    Ok(Some(BookInfo { file_name, markdown: paths::is_markdown(&path), fingerprint, position, no_save }))
}

#[tauri::command(async)]
fn read_book(window: Window, windows: State<ReaderWindows>) -> Result<Response, String> {
    let path = windows.path_of(window.label())?;
    std::fs::read(path).map(Response::new).map_err(|e| e.to_string())
}

/// Reads an image referenced by the open book (a Markdown file), relative to
/// the book's folder. Only image files are served (see paths::resource_path),
/// so a document cannot use this to read anything else.
#[tauri::command(async)]
fn read_book_resource(window: Window, windows: State<ReaderWindows>, path: String) -> Result<Response, String> {
    let book = windows.path_of(window.label())?;
    let target = paths::resource_path(&book, &path).ok_or("Not an image next to the book")?;
    std::fs::read(target).map(Response::new).map_err(|e| e.to_string())
}

/// Takes the fingerprint from the frontend so a position that is still
/// pending when another book replaces it is saved under the right book.
#[tauri::command(async)]
fn save_position(store: State<Store>, fingerprint: String, position: Position) -> Result<(), String> {
    store
        .update(|s| {
            s.positions.insert(fingerprint, position);
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(store: State<Store>) -> Map<String, Value> {
    store.read(|s| s.settings.clone())
}

/// Merges changed settings (so windows never overwrite each other's changes)
/// and passes them on to the other windows.
#[tauri::command(async)]
fn update_settings(window: Window, store: State<Store>, changes: Map<String, Value>) -> Result<(), String> {
    store.update(|s| s.settings.extend(changes.clone())).map_err(|e| e.to_string())?;
    for label in window.app_handle().webview_windows().into_keys().filter(|l| l != window.label()) {
        let _ = window.emit_to(&label, "settings-changed", &changes);
    }
    Ok(())
}

/// Adds the window's book to the recent list, with the title and author the
/// frontend read from it.
#[tauri::command(async)]
fn remember_book(
    window: Window,
    windows: State<ReaderWindows>,
    store: State<Store>,
    fingerprint: String,
    title: String,
    author: String,
) -> Result<(), String> {
    let Launch { file: Some(path), no_save: false } = windows.get(window.label()) else {
        return Ok(());
    };
    let book = RecentBook { path, title, author, fingerprint };
    // Reopening the latest book (or reloading it) changes nothing: skip the write.
    if store.read(|s| s.recent.first() == Some(&book)) {
        return Ok(());
    }
    store.update(|s| s.remember(book)).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentView {
    /// Identifies the entry (the book's fingerprint), so a click still finds
    /// the right book after the list changed in another window.
    key: String,
    title: String,
    author: String,
    file_name: String,
    /// Share read, if a position is saved.
    fraction: Option<f64>,
    /// False when the file has been moved or deleted.
    exists: bool,
}

#[tauri::command(async)]
fn recent_books(store: State<Store>) -> Vec<RecentView> {
    let books = store.read(|s| {
        let fraction = |r: &RecentBook| s.positions.get(&r.fingerprint).map(|p| p.fraction);
        s.recent.iter().map(|r| (r.clone(), fraction(r))).collect::<Vec<_>>()
    });
    // Checked outside the store lock: a slow drive shouldn't hold up other windows.
    books
        .into_iter()
        .map(|(r, fraction)| RecentView {
            file_name: paths::file_name(&r.path),
            exists: r.path.is_file(),
            key: r.fingerprint,
            title: r.title,
            author: r.author,
            fraction,
        })
        .collect()
}

/// Opens a recent book in this window. Books are picked by their key, so the
/// frontend still never supplies a path.
#[tauri::command(async)]
fn open_recent(window: Window, store: State<Store>, key: String) -> Result<(), String> {
    let path = store
        .read(|s| s.recent.iter().find(|r| r.fingerprint == key).map(|r| r.path.clone()))
        .ok_or("That book is no longer in the recent list")?;
    show_book(&window, path);
    Ok(())
}

#[tauri::command(async)]
fn forget_recent(store: State<Store>, key: String) -> Result<(), String> {
    store.update(|s| s.recent.retain(|r| r.fingerprint != key)).map_err(|e| e.to_string())
}

/// Ctrl+O: asks for a book and opens it in this window.
#[tauri::command(async)]
fn pick_book(window: Window) -> Result<(), String> {
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Books", &["epub", "fb2", "fb2.zip", "fbz", "md"])
        .blocking_pick_file();
    if let Some(path) = picked {
        show_book(&window, path.into_path().map_err(|e| e.to_string())?);
    }
    Ok(())
}

/// Opens a window for `launch`, or brings forward the one already showing its file.
fn open_or_focus(app: &AppHandle, launch: Launch) -> tauri::Result<()> {
    if launch.file.as_deref().is_some_and(|file| focus_showing(app, file, None)) {
        return Ok(());
    }
    open_window(app, launch)
}

fn open_window(app: &AppHandle, launch: Launch) -> tauri::Result<()> {
    static NEXT_ID: AtomicUsize = AtomicUsize::new(1);
    let label = format!("reader-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
    let first = app.webview_windows().is_empty();
    app.state::<ReaderWindows>().insert(&label, launch);

    let (geometry, theme) = app.state::<Store>().read(|s| (s.window.clone(), s.settings.get("theme").cloned()));
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("Simple Reader")
        .min_inner_size(400.0, 300.0)
        .initialization_script(theme_script(theme.as_ref().and_then(|t| t.as_str())))
        .visible(false);
    builder = match &geometry {
        Some(g) if first => builder.inner_size(g.width, g.height).position(g.x, g.y).maximized(g.maximized),
        // Windows places (and cascades) later windows itself.
        Some(g) => builder.inner_size(g.width, g.height),
        None => builder.inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT).center(),
    };
    let window = builder.build()?;
    if first && geometry.is_some() && !is_on_screen(&window)? {
        window.center()?;
    }
    window.show()
}

/// Sets the saved theme before the first paint so the window never flashes
/// the wrong colours; the frontend takes over once its settings load.
fn theme_script(theme: Option<&str>) -> String {
    let resolved = match theme {
        Some(t @ ("light" | "dark" | "sepia")) => format!("'{t}'"),
        _ => "matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'".into(),
    };
    // The script may run before <html> exists; then wait for it.
    format!(
        "(() => {{
            const apply = () => !!document.documentElement && !!(document.documentElement.dataset.theme = {resolved});
            if (!apply()) new MutationObserver((_, o) => apply() && o.disconnect()).observe(document, {{ childList: true }});
        }})();"
    )
}

/// A saved position can point at a monitor that is no longer connected.
fn is_on_screen(window: &tauri::WebviewWindow) -> tauri::Result<bool> {
    let pos = window.outer_position()?;
    Ok(window.monitor_from_point(pos.x.into(), pos.y.into())?.is_some())
}

fn remember_geometry(window: &Window) -> tauri::Result<()> {
    if window.is_fullscreen()? {
        return Ok(());
    }
    let maximized = window.is_maximized()?;
    let scale = window.scale_factor()?;
    let pos = window.outer_position()?.to_logical::<f64>(scale);
    let size = window.inner_size()?.to_logical::<f64>(scale);
    let store = window.state::<Store>();
    store.update(|s| {
        // A maximized window keeps the size it will restore to.
        s.window = match (&s.window, maximized) {
            (Some(prev), true) => Some(WindowGeometry { maximized, ..prev.clone() }),
            _ => Some(WindowGeometry { x: pos.x, y: pos.y, width: size.width, height: size.height, maximized }),
        };
    })?;
    Ok(())
}

pub fn run() {
    let cwd = std::env::current_dir().unwrap_or_default();
    let (launch, data_dir) = match cli::parse(std::env::args().skip(1), &cwd) {
        Command::Open { launch, data_dir } => (launch, data_dir),
        other => std::process::exit(run_command(other)),
    };

    tauri::Builder::default()
        // Must come first: a second launch hands its arguments to this process and exits.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Command::Open { launch, .. } = cli::parse(argv.into_iter().skip(1), Path::new(&cwd)) {
                let _ = open_or_focus(app, launch);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ReaderWindows::default())
        .invoke_handler(tauri::generate_handler![
            current_book,
            read_book,
            read_book_resource,
            save_position,
            get_settings,
            update_settings,
            remember_book,
            recent_books,
            open_recent,
            forget_recent,
            pick_book,
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { .. } => {
                let _ = remember_geometry(window);
            }
            WindowEvent::Destroyed => {
                window.state::<ReaderWindows>().remove(window.label());
            }
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                if let Some(path) = paths.first() {
                    show_book(window, path.clone());
                }
            }
            _ => {}
        })
        .setup(move |app| {
            // Loaded here, in the one running app: a second launch hands over
            // its file and exits before setup, so it never touches the data file.
            app.manage(Store::load(data_dir::resolve_state_file(data_dir.as_deref())));
            open_window(app.handle(), launch)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Simple Reader");
}

/// Runs a command that doesn't open a window; returns the exit code.
fn run_command(command: Command) -> i32 {
    match command {
        Command::Help => report(Ok(()), cli::USAGE),
        Command::Version => report(Ok(()), &format!("Simple Reader {}", env!("CARGO_PKG_VERSION"))),
        Command::Invalid(message) => {
            console::print(&format!("{message}\n\n{}", cli::USAGE));
            2
        }
        Command::Register => report(
            std::env::current_exe().and_then(|exe| register::register(&exe)),
            &format!(
                "Simple Reader is registered for {}.\nIf another app still opens them, right-click a file > Open with > \
                 Choose another app > Simple Reader, and tick \"Always\".",
                register::EXTENSIONS.join(", ")
            ),
        ),
        Command::Unregister => report(register::unregister(), "Simple Reader is no longer registered for any file types."),
        Command::Open { .. } => unreachable!("opening is handled by run()"),
    }
}

fn report(result: std::io::Result<()>, success: &str) -> i32 {
    match result {
        Ok(()) => {
            console::print(success);
            0
        }
        Err(e) => {
            console::print(&format!("Failed: {e}"));
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::theme_script;

    #[test]
    fn theme_script_uses_known_themes() {
        assert!(theme_script(Some("sepia")).contains("dataset.theme = 'sepia'"));
    }

    #[test]
    fn theme_script_falls_back_to_the_system_theme() {
        for theme in [None, Some("system"), Some("'; alert(1); '")] {
            let script = theme_script(theme);
            assert!(script.contains("prefers-color-scheme"), "{script}");
            assert!(!script.contains("alert"), "{script}");
        }
    }
}
