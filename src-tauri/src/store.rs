use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Everything the app remembers between runs, kept in one JSON file.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct State {
    /// Owned by the frontend; the backend stores it as-is.
    pub settings: Map<String, Value>,
    /// Reading positions keyed by book fingerprint.
    pub positions: HashMap<String, Position>,
    pub window: Option<WindowGeometry>,
    /// Recently opened books, newest first.
    pub recent: Vec<RecentBook>,
}

/// How many books the start screen lists.
pub const RECENT_LIMIT: usize = 10;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentBook {
    pub path: PathBuf,
    pub title: String,
    pub author: String,
    /// Links the entry to its saved position (for "% read").
    pub fingerprint: String,
}

impl State {
    /// Puts a book at the top of the recent list, once, keeping the list short.
    pub fn remember(&mut self, book: RecentBook) {
        self.recent.retain(|r| !crate::paths::same_file(&r.path, &book.path));
        self.recent.insert(0, book);
        self.recent.truncate(RECENT_LIMIT);
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub cfi: String,
    pub fraction: f64,
}

/// Window placement in logical pixels.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

pub struct Store {
    path: PathBuf,
    state: Mutex<State>,
}

impl Store {
    /// Loads the state file. A missing file gives an empty state; a corrupt
    /// one is moved aside to `<name>.bak` rather than silently overwritten.
    pub fn load(path: PathBuf) -> Self {
        let state = match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| {
                let _ = fs::rename(&path, path.with_extension("json.bak"));
                State::default()
            }),
            Err(_) => State::default(),
        };
        Store { path, state: Mutex::new(state) }
    }

    pub fn read<R>(&self, f: impl FnOnce(&State) -> R) -> R {
        f(&self.state.lock().unwrap())
    }

    /// Applies a change and writes the whole state to disk.
    pub fn update(&self, f: impl FnOnce(&mut State)) -> io::Result<()> {
        let mut state = self.state.lock().unwrap();
        f(&mut state);
        write_atomically(&self.path, &serde_json::to_vec_pretty(&*state)?)
    }
}

fn write_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn position(cfi: &str) -> Position {
        Position { cfi: cfi.into(), fraction: 0.5 }
    }

    #[test]
    fn missing_file_gives_empty_state() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::load(dir.path().join("sreader.json"));
        assert_eq!(store.read(State::clone), State::default());
    }

    #[test]
    fn updates_survive_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("sreader.json");
        let store = Store::load(path.clone());
        store
            .update(|s| {
                s.positions.insert("book".into(), position("epubcfi(/6/4)"));
            })
            .unwrap();
        let reloaded = Store::load(path);
        assert_eq!(reloaded.read(|s| s.positions["book"].clone()), position("epubcfi(/6/4)"));
    }

    #[test]
    fn recent_list_is_newest_first_without_duplicates() {
        let book = |path: &str| RecentBook {
            path: PathBuf::from(path),
            title: path.into(),
            author: String::new(),
            fingerprint: path.into(),
        };
        let mut state = State::default();
        for i in 0..12 {
            state.remember(book(&format!("{i}.epub")));
        }
        state.remember(book("5.epub"));
        let paths: Vec<_> = state.recent.iter().map(|r| r.path.to_string_lossy().into_owned()).collect();
        assert_eq!(paths.len(), RECENT_LIMIT);
        assert_eq!(&paths[..3], ["5.epub", "11.epub", "10.epub"]);
        assert_eq!(paths.iter().filter(|p| *p == "5.epub").count(), 1);
    }

    #[test]
    fn corrupt_file_is_backed_up() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sreader.json");
        fs::write(&path, "{ not json").unwrap();
        let store = Store::load(path.clone());
        assert_eq!(store.read(State::clone), State::default());
        assert_eq!(fs::read_to_string(path.with_extension("json.bak")).unwrap(), "{ not json");
    }

    #[test]
    fn unknown_and_missing_fields_are_tolerated() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sreader.json");
        fs::write(&path, r#"{"settings":{"flow":"scrolled"},"future":1}"#).unwrap();
        let store = Store::load(path);
        assert_eq!(store.read(|s| s.settings["flow"].clone()), "scrolled");
    }
}
