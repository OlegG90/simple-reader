use std::path::{Component, Path, PathBuf};

/// Image types a Markdown file may show from next to it.
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"];

/// Whether the file name ends in one of `extensions` (case-insensitive, without dots).
fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| extensions.iter().any(|known| ext.eq_ignore_ascii_case(known)))
}

pub fn is_markdown(path: &Path) -> bool {
    has_extension(path, &["md"])
}

/// Resolves an image a Markdown file refers to, relative to the file's folder.
/// Anything that isn't an image or isn't a plain relative path (a root, a
/// drive or a UNC share) is refused, so a document can't read other files.
pub fn resource_path(book: &Path, relative: &str) -> Option<PathBuf> {
    let relative = Path::new(relative);
    let plain = relative
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir | Component::ParentDir));
    (plain && has_extension(relative, IMAGE_EXTENSIONS)).then(|| book.parent().unwrap_or(book).join(relative))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resources_are_images_relative_to_the_book() {
        let book = Path::new(r"C:\Notes\guide.md");
        let notes = Path::new(r"C:\Notes");
        assert_eq!(resource_path(book, "img/a.PNG"), Some(notes.join("img/a.PNG")));
        assert_eq!(resource_path(book, "./a.png"), Some(notes.join("./a.png")));
        assert_eq!(resource_path(book, "../shared/b.svg"), Some(notes.join("../shared/b.svg")));
    }

    #[test]
    fn other_files_and_other_places_are_refused() {
        let book = Path::new(r"C:\Notes\guide.md");
        for path in ["secrets.txt", "noextension", r"C:\Windows\a.png", r"\Windows\a.png", "/Users/x/a.png", "C:a.png", r"\\server\share\a.png"] {
            assert_eq!(resource_path(book, path), None, "{path}");
        }
    }

    #[test]
    fn markdown_is_recognised_by_extension() {
        assert!(is_markdown(Path::new("Notes.MD")));
        assert!(!is_markdown(Path::new("book.epub")));
        assert!(!is_markdown(Path::new("md")));
    }
}
