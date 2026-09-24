mod cli;
mod data_dir;
mod fingerprint;
mod store;

use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use store::{Position, Store, WindowGeometry};
use tauri::ipc::Response;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

const DEFAULT_WIDTH: f64 = 1100.0;
const DEFAULT_HEIGHT: f64 = 800.0;

/// The book file shown in each window, by window label. The frontend never
/// passes file paths: it can only read the book the backend assigned to its
/// window, so book content cannot make the app read arbitrary files.
#[derive(Default)]
struct Books(Mutex<HashMap<String, PathBuf>>);

impl Books {
    fn assign(&self, label: &str, path: PathBuf) {
        self.0.lock().unwrap().insert(label.to_string(), path);
    }

    fn path_of(&self, label: &str) -> Result<PathBuf, String> {
        self.0.lock().unwrap().get(label).cloned().ok_or_else(|| "No book is open".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BookInfo {
    file_name: String,
    fingerprint: String,
    position: Option<Position>,
}

#[tauri::command(async)]
fn current_book(window: Window, books: State<Books>, store: State<Store>) -> Result<Option<BookInfo>, String> {
    let Ok(path) = books.path_of(window.label()) else {
        return Ok(None);
    };
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let fingerprint = fingerprint::fingerprint(&path).map_err(|e| format!("{file_name}: {e}"))?;
    let position = store.read(|s| s.positions.get(&fingerprint).cloned());
    Ok(Some(BookInfo { file_name, fingerprint, position }))
}

#[tauri::command(async)]
fn read_book(window: Window, books: State<Books>) -> Result<Response, String> {
    let path = books.path_of(window.label())?;
    std::fs::read(path).map(Response::new).map_err(|e| e.to_string())
}

/// Image types a Markdown file may show from next to it.
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"];

/// Reads an image referenced by the open book (a Markdown file), relative to
/// the book's folder. Only image files are served, so a document cannot use
/// this to read anything else.
#[tauri::command(async)]
fn read_book_resource(window: Window, books: State<Books>, path: String) -> Result<Response, String> {
    let book = books.path_of(window.label())?;
    let target = resource_path(&book, &path).ok_or("Not an image next to the book")?;
    std::fs::read(target).map(Response::new).map_err(|e| e.to_string())
}

fn resource_path(book: &std::path::Path, relative: &str) -> Option<PathBuf> {
    let relative = std::path::Path::new(relative);
    let is_image = relative
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| IMAGE_EXTENSIONS.iter().any(|known| ext.eq_ignore_ascii_case(known)));
    (is_image && relative.is_relative()).then(|| book.parent().unwrap_or(book).join(relative))
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

/// Merges changed settings, so windows never overwrite each other's changes.
#[tauri::command(async)]
fn update_settings(store: State<Store>, changes: Map<String, Value>) -> Result<(), String> {
    store.update(|s| s.settings.extend(changes)).map_err(|e| e.to_string())
}

fn open_window(app: &AppHandle, file: Option<PathBuf>) -> tauri::Result<()> {
    static NEXT_ID: AtomicUsize = AtomicUsize::new(1);
    let label = format!("reader-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
    if let Some(file) = file {
        app.state::<Books>().assign(&label, file);
    }

    let (geometry, theme) = app.state::<Store>().read(|s| (s.window.clone(), s.settings.get("theme").cloned()));
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("Simple Reader")
        .min_inner_size(400.0, 300.0)
        .initialization_script(theme_script(theme.as_ref().and_then(|t| t.as_str())))
        .visible(false);
    builder = match &geometry {
        Some(g) => builder.inner_size(g.width, g.height).position(g.x, g.y).maximized(g.maximized),
        None => builder.inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT).center(),
    };
    let window = builder.build()?;
    if geometry.is_some() && !is_on_screen(&window)? {
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
    let launch = cli::parse(std::env::args().skip(1));
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Store::load(data_dir::default_state_file()))
        .manage(Books::default())
        .invoke_handler(tauri::generate_handler![current_book, read_book, read_book_resource, save_position, get_settings, update_settings])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { .. } => {
                let _ = remember_geometry(window);
            }
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                if let Some(path) = paths.first() {
                    window.state::<Books>().assign(window.label(), path.clone());
                    let _ = window.app_handle().emit_to(window.label(), "book-changed", ());
                }
            }
            _ => {}
        })
        .setup(move |app| {
            open_window(app.handle(), launch.file)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Simple Reader");
}

#[cfg(test)]
mod tests {
    use super::{resource_path, theme_script};
    use std::path::Path;

    #[test]
    fn resources_are_images_relative_to_the_book() {
        let book = Path::new(r"C:\Notes\guide.md");
        let notes = Path::new(r"C:\Notes");
        assert_eq!(resource_path(book, "img/a.PNG"), Some(notes.join("img/a.PNG")));
        assert_eq!(resource_path(book, "../shared/b.svg"), Some(notes.join("../shared/b.svg")));
        assert_eq!(resource_path(book, "secrets.txt"), None);
        assert_eq!(resource_path(book, "noextension"), None);
        assert_eq!(resource_path(book, r"C:\Windows\a.png"), None);
    }

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
