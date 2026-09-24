//! File associations for the current user (HKCU, no admin rights).
//!
//! `--register` adds Simple Reader to "Open with" for its file types and makes
//! it the default where the user hasn't chosen another app. Windows keeps the
//! user's own choice (set via "Open with → Always") out of reach of apps, so
//! that one stays the user's to make. `.fb2.zip` can't be associated: Windows
//! only looks at the last extension, and taking over `.zip` is not an option.

use std::io;
use std::path::Path;
use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, KEY_ALL_ACCESS};
use winreg::RegKey;

const PROG_ID: &str = "SimpleReader.Book";
const APP_KEY: &str = r"Applications\sreader.exe";
pub const EXTENSIONS: &[&str] = &[".epub", ".fb2", ".fbz", ".md"];

fn user_classes() -> io::Result<RegKey> {
    RegKey::predef(HKEY_CURRENT_USER).create_subkey(r"Software\Classes").map(|(key, _)| key)
}

pub fn register(exe: &Path) -> io::Result<()> {
    // HKEY_CLASSES_ROOT merges the user's and the machine's (all users') settings.
    let classes_root = RegKey::predef(HKEY_CLASSES_ROOT);
    register_in(&user_classes()?, exe, |ext| default_of(&classes_root, ext))?;
    notify_shell();
    Ok(())
}

/// The program an extension opens with by default, if any.
fn default_of(classes: &RegKey, ext: &str) -> Option<String> {
    let value: String = classes.open_subkey(ext).ok()?.get_value("").ok()?;
    (!value.is_empty()).then_some(value)
}

pub fn unregister() -> io::Result<()> {
    unregister_in(&user_classes()?)?;
    notify_shell();
    Ok(())
}

/// Registers under `classes`, the user's `Software\Classes` (or a test key);
/// `current_default` says which program an extension opens with today.
fn register_in(classes: &RegKey, exe: &Path, current_default: impl Fn(&str) -> Option<String>) -> io::Result<()> {
    let exe = exe.to_string_lossy();
    let open = format!("\"{exe}\" \"%1\"");

    let (prog, _) = classes.create_subkey(PROG_ID)?;
    prog.set_value("", &"E-book")?;
    prog.create_subkey("DefaultIcon")?.0.set_value("", &format!("\"{exe}\",0"))?;
    prog.create_subkey(r"shell\open\command")?.0.set_value("", &open)?;

    let (app, _) = classes.create_subkey(APP_KEY)?;
    app.set_value("FriendlyAppName", &"Simple Reader")?;
    app.create_subkey(r"shell\open\command")?.0.set_value("", &open)?;
    let (types, _) = app.create_subkey("SupportedTypes")?;

    for ext in EXTENSIONS {
        types.set_value(*ext, &"")?;
        let (key, _) = classes.create_subkey(ext)?;
        key.create_subkey("OpenWithProgids")?.0.set_value(PROG_ID, &"")?;
        // Become the default only where no program is the default yet.
        if current_default(ext).is_none() {
            key.set_value("", &PROG_ID)?;
        }
    }
    Ok(())
}

/// Removes what `register_in` added, leaving other apps' settings alone.
fn unregister_in(classes: &RegKey) -> io::Result<()> {
    for ext in EXTENSIONS {
        let Ok(key) = classes.open_subkey_with_flags(ext, KEY_ALL_ACCESS) else { continue };
        if let Ok(with) = key.open_subkey_with_flags("OpenWithProgids", KEY_ALL_ACCESS) {
            ignore_missing(with.delete_value(PROG_ID))?;
        }
        if key.get_value::<String, _>("").is_ok_and(|v| v == PROG_ID) {
            key.delete_value("")?;
        }
    }
    ignore_missing(classes.delete_subkey_all(PROG_ID))?;
    ignore_missing(classes.delete_subkey_all(APP_KEY))
}

fn ignore_missing(result: io::Result<()>) -> io::Result<()> {
    match result {
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

/// Tells Explorer the associations changed, so icons and "Open with" update.
fn notify_shell() {
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    // SAFETY: SHCNE_ASSOCCHANGED takes no items, so both item pointers may be null.
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED as i32, SHCNF_IDLIST, std::ptr::null(), std::ptr::null()) };
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A throwaway key standing in for `Software\Classes`, removed afterwards.
    struct TestClasses(String);

    impl TestClasses {
        fn new(name: &str) -> (Self, RegKey) {
            let path = format!(r"Software\SimpleReaderTest-{}-{name}", std::process::id());
            let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(&path).unwrap();
            (TestClasses(path), key)
        }
    }

    impl Drop for TestClasses {
        fn drop(&mut self) {
            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.0);
        }
    }

    const EXE: &str = r"C:\Tools\sreader.exe";

    #[test]
    fn register_adds_open_with_and_default_then_unregister_removes_them() {
        let (_guard, classes) = TestClasses::new("roundtrip");
        register_in(&classes, Path::new(EXE), |ext| default_of(&classes, ext)).unwrap();

        let command: String = classes.open_subkey(format!(r"{PROG_ID}\shell\open\command")).unwrap().get_value("").unwrap();
        assert_eq!(command, format!("\"{EXE}\" \"%1\""));
        for ext in EXTENSIONS {
            let key = classes.open_subkey(ext).unwrap();
            assert_eq!(key.get_value::<String, _>("").unwrap(), PROG_ID, "{ext}");
            assert!(key.open_subkey("OpenWithProgids").unwrap().get_raw_value(PROG_ID).is_ok(), "{ext}");
        }

        unregister_in(&classes).unwrap();
        assert!(classes.open_subkey(PROG_ID).is_err());
        assert!(classes.open_subkey(APP_KEY).is_err());
        for ext in EXTENSIONS {
            let key = classes.open_subkey(ext).unwrap();
            assert!(key.get_value::<String, _>("").is_err(), "{ext}");
        }
    }

    #[test]
    fn another_apps_default_is_kept() {
        let (_guard, classes) = TestClasses::new("other");
        classes.create_subkey(".md").unwrap().0.set_value("", &"VSCode.md").unwrap();
        register_in(&classes, Path::new(EXE), |ext| default_of(&classes, ext)).unwrap();
        unregister_in(&classes).unwrap();
        let default: String = classes.open_subkey(".md").unwrap().get_value("").unwrap();
        assert_eq!(default, "VSCode.md");
    }

    #[test]
    fn a_default_set_for_all_users_is_not_taken_over() {
        let (_guard, classes) = TestClasses::new("machine");
        register_in(&classes, Path::new(EXE), |ext| (ext == ".epub").then(|| "Calibre.Epub".to_string())).unwrap();
        assert!(classes.open_subkey(".epub").unwrap().get_value::<String, _>("").is_err());
        assert_eq!(classes.open_subkey(".fb2").unwrap().get_value::<String, _>("").unwrap(), PROG_ID);
    }

    #[test]
    fn unregister_without_register_is_fine() {
        let (_guard, classes) = TestClasses::new("empty");
        unregister_in(&classes).unwrap();
    }
}
