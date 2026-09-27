use std::{env, fmt::Write, fs, path::Path};

fn main() {
    write_libraries();
    tauri_build::build()
}

/// Writes `LIBRARIES` (name, version) for `--version`: the Tauri crates in
/// Cargo.toml, the vendored foliate-js and the npm dependencies in
/// package.json, with versions from the lockfiles, so the list can't drift
/// from the build. (Watching the lockfiles reruns this script whenever a
/// dependency changes; that is the price of the versions staying right.)
fn write_libraries() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let read = |path: &str| {
        let path = root.join(path);
        println!("cargo:rerun-if-changed={}", path.display());
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
    };

    let mut rows = String::new();
    let mut row = |name: &str, version: &str| writeln!(rows, "    ({name:?}, {version:?}),").unwrap();

    let manifest: toml::Table = read("Cargo.toml").parse().expect("parse Cargo.toml");
    let cargo_lock: toml::Table = read("Cargo.lock").parse().expect("parse Cargo.lock");
    for name in manifest["dependencies"].as_table().unwrap().keys().filter(|name| name.starts_with("tauri")) {
        let version = cargo_lock["package"].as_array().unwrap().iter().find(|package| package["name"].as_str() == Some(name.as_str())).and_then(|package| package["version"].as_str());
        row(name, version.unwrap_or_else(|| panic!("{name} is not in Cargo.lock")));
    }

    row("foliate-js", &foliate_version(&read("../src/vendor/foliate-js/README.md")));

    let package: serde_json::Value = serde_json::from_str(&read("../package.json")).expect("parse package.json");
    let npm_lock: serde_json::Value = serde_json::from_str(&read("../package-lock.json")).expect("parse package-lock.json");
    for name in package["dependencies"].as_object().expect("package.json has dependencies").keys() {
        let version = npm_lock["packages"][format!("node_modules/{name}")]["version"].as_str();
        row(name, version.unwrap_or_else(|| panic!("{name} is not in package-lock.json")));
    }

    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("libraries.rs");
    fs::write(out, format!("pub const LIBRARIES: &[(&str, &str)] = &[\n{rows}];\n")).expect("write libraries.rs");
}

/// foliate-js is vendored: its version is the upstream commit named in the
/// vendor README ("Commit: <sha> (<date>)"), shortened to "<sha7> (<date>)".
fn foliate_version(readme: &str) -> String {
    let line = readme.lines().find_map(|line| line.strip_prefix("Commit: ")).expect("the foliate-js vendor README names its commit");
    let (sha, date) = line.split_once(' ').expect("the commit line has a date");
    format!("{} {date}", &sha[..7])
}
