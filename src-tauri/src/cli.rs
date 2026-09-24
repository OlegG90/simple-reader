use std::path::PathBuf;

/// What the app was asked to do on launch.
#[derive(Debug, Default, PartialEq)]
pub struct Launch {
    /// The book to open, if any.
    pub file: Option<PathBuf>,
}

/// Parses command-line arguments, without the program name.
pub fn parse<I: IntoIterator<Item = String>>(args: I) -> Launch {
    let file = args
        .into_iter()
        .find(|arg| !arg.starts_with("--"))
        .map(PathBuf::from);
    Launch { file }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn no_arguments_opens_nothing() {
        assert_eq!(parse(args(&[])), Launch::default());
    }

    #[test]
    fn first_positional_argument_is_the_file() {
        let launch = parse(args(&[r"C:\Books\a b.epub", "other.fb2"]));
        assert_eq!(launch.file, Some(PathBuf::from(r"C:\Books\a b.epub")));
    }

    #[test]
    fn flags_are_not_files() {
        let launch = parse(args(&["--unknown", "book.epub"]));
        assert_eq!(launch.file, Some(PathBuf::from("book.epub")));
    }
}
