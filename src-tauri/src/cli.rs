use std::path::{Path, PathBuf};

/// A window to open.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Launch {
    /// The book to open; `None` shows the start screen.
    pub file: Option<PathBuf>,
    /// Don't save the reading position (or the recent list) for this window.
    pub no_save: bool,
}

/// What the app was asked to do.
#[derive(Debug, PartialEq)]
pub enum Command {
    Open { launch: Launch, data_dir: Option<PathBuf> },
    Register,
    Unregister,
    Help,
    Version,
    /// Bad arguments; the message says why.
    Invalid(String),
}

pub const USAGE: &str = "\
Simple Reader - a minimal e-book reader

Usage:
  sreader [<file>] [--no-save] [--data-dir <path>]
  sreader --register | --unregister
  sreader --help | --version

Options:
  <file>               Open an .epub, .fb2, .fb2.zip or .md file
  --no-save            Don't remember the reading position for this window
  --data-dir <path>    Keep settings and positions in this folder
                       (a running Simple Reader keeps the folder it started with)
  --register           Offer Simple Reader for .epub, .fb2, .fbz and .md files (current user)
  --unregister         Remove what --register added
  --help, -h           Show this help
  --version, -V        Show the version";

/// Parses command-line arguments (without the program name). Relative file
/// paths are resolved against `cwd`, which matters when a second launch is
/// forwarded to the running app from another folder.
pub fn parse<I: IntoIterator<Item = String>>(args: I, cwd: &Path) -> Command {
    let mut launch = Launch::default();
    let mut data_dir = None;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--register" => return Command::Register,
            "--unregister" => return Command::Unregister,
            "--help" | "-h" | "/?" => return Command::Help,
            "--version" | "-V" => return Command::Version,
            "--no-save" => launch.no_save = true,
            "--data-dir" => match args.next() {
                Some(dir) => data_dir = Some(cwd.join(dir)),
                None => return Command::Invalid("--data-dir needs a folder".into()),
            },
            _ if arg.starts_with("--data-dir=") => data_dir = Some(cwd.join(&arg["--data-dir=".len()..])),
            _ if arg.starts_with('-') => return Command::Invalid(format!("Unknown option {arg}")),
            _ if launch.file.is_some() => return Command::Invalid("Open one file at a time".into()),
            _ => launch.file = Some(cwd.join(arg)),
        }
    }
    Command::Open { launch, data_dir }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(list: &[&str]) -> Command {
        parse(list.iter().map(|s| s.to_string()), Path::new(r"C:\Books"))
    }

    fn open(file: Option<&str>, no_save: bool, data_dir: Option<&str>) -> Command {
        Command::Open {
            launch: Launch { file: file.map(PathBuf::from), no_save },
            data_dir: data_dir.map(PathBuf::from),
        }
    }

    #[test]
    fn no_arguments_shows_the_start_screen() {
        assert_eq!(run(&[]), open(None, false, None));
    }

    #[test]
    fn a_file_is_resolved_against_the_working_folder() {
        assert_eq!(run(&["a b.epub"]), open(Some(r"C:\Books\a b.epub"), false, None));
        assert_eq!(run(&[r"D:\x.fb2"]), open(Some(r"D:\x.fb2"), false, None));
    }

    #[test]
    fn options_combine_in_any_order() {
        assert_eq!(
            run(&["--no-save", "book.md", "--data-dir", "data"]),
            open(Some(r"C:\Books\book.md"), true, Some(r"C:\Books\data"))
        );
        assert_eq!(run(&[r"--data-dir=E:\cfg"]), open(None, false, Some(r"E:\cfg")));
    }

    #[test]
    fn commands_win_over_everything_else() {
        assert_eq!(run(&["book.epub", "--register"]), Command::Register);
        assert_eq!(run(&["--unregister"]), Command::Unregister);
        assert_eq!(run(&["-h"]), Command::Help);
        assert_eq!(run(&["--version"]), Command::Version);
    }

    #[test]
    fn mistakes_are_reported() {
        assert!(matches!(run(&["--nosave"]), Command::Invalid(m) if m.contains("--nosave")));
        assert!(matches!(run(&["--data-dir"]), Command::Invalid(_)));
        assert!(matches!(run(&["a.epub", "b.epub"]), Command::Invalid(_)));
    }
}
