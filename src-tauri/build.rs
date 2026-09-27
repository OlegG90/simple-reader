use std::{env, fs, path::Path};

/// Rust crates whose versions `--version` reports, as named in Cargo.lock.
const CRATES: &[&str] = &["tauri", "tauri-plugin-dialog", "tauri-plugin-opener", "tauri-plugin-single-instance"];
/// Frontend libraries whose versions `--version` reports, as named in package.json.
const NPM_PACKAGES: &[&str] = &["marked", "mermaid", "highlight.js"];

fn main() {
    write_libraries();
    tauri_build::build()
}

/// Writes `LIBRARIES` (name, version) for `--version`, read from the lockfiles
/// and the vendored foliate-js, so the list can't drift from what is built.
fn write_libraries() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let root = Path::new(&manifest_dir);
    let cargo_lock = root.join("Cargo.lock");
    let npm_lock = root.join("../package-lock.json");
    let foliate_readme = root.join("../src/vendor/foliate-js/README.md");
    for path in [&cargo_lock, &npm_lock, &foliate_readme] {
        println!("cargo:rerun-if-changed={}", path.display());
    }

    let mut libraries = Vec::new();
    let cargo_lock = fs::read_to_string(cargo_lock).expect("read Cargo.lock");
    for name in CRATES {
        libraries.push((name.to_string(), crate_version(&cargo_lock, name)));
    }
    libraries.push(("foliate-js".to_string(), foliate_version(&fs::read_to_string(foliate_readme).expect("read the foliate-js vendor README"))));
    let npm_lock: serde_json::Value = serde_json::from_str(&fs::read_to_string(npm_lock).expect("read package-lock.json")).expect("parse package-lock.json");
    for name in NPM_PACKAGES {
        let version = npm_lock["packages"][format!("node_modules/{name}")]["version"].as_str();
        libraries.push((name.to_string(), version.unwrap_or_else(|| panic!("{name} is not in package-lock.json")).to_string()));
    }

    let rows: String = libraries.iter().map(|(name, version)| format!("    ({name:?}, {version:?}),\n")).collect();
    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("libraries.rs");
    fs::write(out, format!("pub const LIBRARIES: &[(&str, &str)] = &[\n{rows}];\n")).expect("write libraries.rs");
}

/// The version of a crate in Cargo.lock: each `[[package]]` has a `name = "…"`
/// line followed by its `version = "…"` line.
fn crate_version(lock: &str, name: &str) -> String {
    let mut lines = lock.lines();
    lines
        .find(|line| *line == format!("name = \"{name}\""))
        .and_then(|_| lines.next())
        .and_then(|line| line.strip_prefix("version = \""))
        .and_then(|rest| rest.strip_suffix('"'))
        .unwrap_or_else(|| panic!("{name} is not in Cargo.lock"))
        .to_string()
}

/// foliate-js is vendored: its version is the upstream commit named in the
/// vendor README ("Commit: <sha> (<date>)"), shortened to "<sha7> (<date>)".
fn foliate_version(readme: &str) -> String {
    let line = readme.lines().find_map(|line| line.strip_prefix("Commit: ")).expect("the foliate-js vendor README names its commit");
    let (sha, date) = line.split_once(' ').unwrap_or((line, ""));
    format!("{} {date}", sha.chars().take(7).collect::<String>()).trim_end().to_string()
}
