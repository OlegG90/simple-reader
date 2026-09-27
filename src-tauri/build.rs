use std::{env, fs, path::Path};

/// Frontend libraries whose versions `--version` reports, as named in package.json.
const NPM_LIBRARIES: [&str; 3] = ["marked", "mermaid", "highlight.js"];
const LOCKFILE: &str = "../package-lock.json";
const FOLIATE_README: &str = "../src/vendor/foliate-js/README.md";

fn main() {
    write_libraries();
    tauri_build::build()
}

/// Writes `LIBRARIES` (name, version) for `--version`, read from what the
/// build actually bundles, so the list can't drift from it.
fn write_libraries() {
    println!("cargo:rerun-if-changed={LOCKFILE}");
    println!("cargo:rerun-if-changed={FOLIATE_README}");

    let mut libraries = vec![("foliate-js".to_string(), foliate_version())];
    let lock: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(LOCKFILE).expect("read package-lock.json"))
            .expect("parse package-lock.json");
    for name in NPM_LIBRARIES {
        let version = lock["packages"][format!("node_modules/{name}")]["version"]
            .as_str()
            .unwrap_or_else(|| panic!("{name} is not in package-lock.json"));
        libraries.push((name.to_string(), version.to_string()));
    }

    let rows: String = libraries
        .iter()
        .map(|(name, version)| format!("    ({name:?}, {version:?}),\n"))
        .collect();
    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("libraries.rs");
    fs::write(
        out,
        format!("pub const LIBRARIES: &[(&str, &str)] = &[\n{rows}];\n"),
    )
    .expect("write libraries.rs");
}

/// foliate-js is vendored: its version is the upstream commit named in the
/// vendor README ("Commit: <sha> (<date>)"), shortened to "<sha7> (<date>)".
fn foliate_version() -> String {
    let readme = fs::read_to_string(FOLIATE_README).expect("read the foliate-js vendor README");
    let line = readme
        .lines()
        .find_map(|line| line.strip_prefix("Commit: "))
        .expect("the foliate-js vendor README names its commit");
    let (sha, date) = line.split_once(' ').unwrap_or((line, ""));
    format!("{} {}", &sha[..sha.len().min(7)], date)
        .trim_end()
        .to_string()
}
