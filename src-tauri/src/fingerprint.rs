use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

/// How much of the file start is hashed; enough to tell books apart cheaply.
const HEAD_LEN: u64 = 64 * 1024;

/// Identifies a book by its content (size + hash of its start), so the
/// reading position survives moving or renaming the file.
pub fn fingerprint(path: &Path) -> io::Result<String> {
    let file = File::open(path)?;
    let size = file.metadata()?.len();
    let mut head = Vec::new();
    file.take(HEAD_LEN).read_to_end(&mut head)?;
    let hash = Sha256::digest(&head);
    let hex: String = hash[..12].iter().map(|b| format!("{b:02x}")).collect();
    Ok(format!("{size:x}-{hex}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn same_content_same_fingerprint_regardless_of_name() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.epub");
        let b = dir.path().join("renamed.epub");
        fs::write(&a, b"book content").unwrap();
        fs::write(&b, b"book content").unwrap();
        assert_eq!(fingerprint(&a).unwrap(), fingerprint(&b).unwrap());
    }

    #[test]
    fn different_content_different_fingerprint() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.epub");
        let b = dir.path().join("b.epub");
        fs::write(&a, b"book one").unwrap();
        fs::write(&b, b"book two").unwrap();
        assert_ne!(fingerprint(&a).unwrap(), fingerprint(&b).unwrap());
    }

    #[test]
    fn size_distinguishes_books_with_equal_heads() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.epub");
        let b = dir.path().join("b.epub");
        let head = vec![7u8; HEAD_LEN as usize];
        fs::write(&a, [head.as_slice(), b"x"].concat()).unwrap();
        fs::write(&b, [head.as_slice(), b"xy"].concat()).unwrap();
        assert_ne!(fingerprint(&a).unwrap(), fingerprint(&b).unwrap());
    }

    #[test]
    fn missing_file_is_an_error() {
        assert!(fingerprint(Path::new(r"Z:\no\such\book.epub")).is_err());
    }
}
