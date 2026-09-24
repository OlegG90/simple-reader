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

/// The book shown in a window. The frontend never passes file paths: it can
/// only read the book the backend assigned to its window, so book content
/// cannot make the app read arbitrary files.
struct OpenBook {
    path: PathBuf,
    fingerprint: Option<String>,
}

#[derive(Default)]
struct Books(Mutex<HashMap<String, OpenBook>>);

impl Books {
    fn set(&self, label: &str, path: PathBuf) {
        let book = OpenBook { path, fingerprint: None };
        self.0.lock().unwrap().insert(label.to_string(), book);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BookInfo {
    file_name: String,
    position: Option<Position>,
}

#[tauri::command]
fn current_book(window: Window, books: State<Books>, store: State<Store>) -> Result<Option<BookInfo>, String> {
    let mut books = books.0.lock().unwrap();
    let Some(book) = books.get_mut(window.label()) else {
        return Ok(None);
    };
    let file_name = book.path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let fingerprint = fingerprint::fingerprint(&book.path).map_err(|e| format!("{file_name}: {e}"))?;
    let position = store.read(|s| s.positions.get(&fingerprint).cloned());
    book.fingerprint = Some(fingerprint);
    Ok(Some(BookInfo { file_name, position }))
}

#[tauri::command]
fn read_book(window: Window, books: State<Books>) -> Result<Response, String> {
    let path = books.0.lock().unwrap().get(window.label()).map(|b| b.path.clone());
    let path = path.ok_or("No book is open")?;
    std::fs::read(path).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_position(window: Window, books: State<Books>, store: State<Store>, position: Position) -> Result<(), String> {
    let fingerprint = books.0.lock().unwrap().get(window.label()).and_then(|b| b.fingerprint.clone());
    let fingerprint = fingerprint.ok_or("No book is open")?;
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

#[tauri::command]
fn set_settings(store: State<Store>, settings: Map<String, Value>) -> Result<(), String> {
    store.update(|s| s.settings = settings).map_err(|e| e.to_string())
}

fn open_window(app: &AppHandle, file: Option<PathBuf>) -> tauri::Result<()> {
    static NEXT_ID: AtomicUsize = AtomicUsize::new(1);
    let label = format!("reader-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
    if let Some(file) = file {
        app.state::<Books>().set(&label, file);
    }

    let geometry = app.state::<Store>().read(|s| s.window.clone());
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("Simple Reader")
        .min_inner_size(400.0, 300.0)
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

/// A saved position can point at a monitor that is no longer connected.
fn is_on_screen(window: &tauri::WebviewWindow) -> tauri::Result<bool> {
    let pos = window.outer_position()?;
    Ok(window.available_monitors()?.iter().any(|m| {
        let (mp, ms) = (m.position(), m.size());
        pos.x >= mp.x && pos.y >= mp.y && pos.x < mp.x + ms.width as i32 && pos.y < mp.y + ms.height as i32
    }))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch = cli::parse(std::env::args().skip(1));
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Store::load(data_dir::default_state_file()))
        .manage(Books::default())
        .invoke_handler(tauri::generate_handler![current_book, read_book, save_position, get_settings, set_settings])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { .. } => {
                let _ = remember_geometry(window);
            }
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                if let Some(path) = paths.first() {
                    window.state::<Books>().set(window.label(), path.clone());
                    let _ = window.app_handle().emit_to(window.label(), "book-changed", ());
                }
            }
            _ => {}
        })
        .setup(move |app| {
            open_window(app.handle(), launch.file.clone())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Simple Reader");
}
