//! The folders a native picker has returned — the only folders the webview
//! can ever be granted.
//!
//! The capability file ships no path scope, so the fs bridge starts with
//! access to nothing. `allow_vault` used to widen it to whatever path the
//! webview named, which made that empty scope decorative: a compromised
//! webview could name C:\ and read the disk. Now the picker runs in Rust,
//! the chosen folder is recorded here, and `allow_vault` only re-grants a
//! folder already in the record — or one inside it, since the fs scope
//! covers a vault recursively anyway.
//!
//! The record would be worthless if the webview could write to it, so two
//! things keep it out of reach, either of which would do on its own: the
//! config directory it lives in is forbidden in the fs scope at startup
//! (forbidden beats allowed in the fs plugin), and a picked folder that
//! contains or sits inside that directory is refused before it is recorded
//! (`overlaps`). Everything here is plain std and serde_json so the rule
//! can be unit-tested without a Tauri runtime.

use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "known_vaults.json";

/// Is `candidate` one of the known folders, or beneath one?
///
/// Both sides are expected to be canonical already — this compares path
/// components and never touches the disk. An empty entry would match
/// everything (every path "starts with" the empty path), so it is skipped
/// rather than trusted; the record is ours, but a hand-edited or damaged
/// file must fail closed.
pub fn covered_by(known: &[PathBuf], candidate: &Path) -> bool {
    known
        .iter()
        .filter(|k| !k.as_os_str().is_empty())
        .any(|k| candidate.starts_with(k))
}

/// Would `folder`, as a vault, collide with the `protected` directory?
///
/// Picking a home directory as a vault is legal in principle, but on every
/// platform the app's config directory sits beneath it — and a recursive
/// grant over the record would let the webview write its own entries into
/// it. The other direction is refused too: a vault inside the config
/// directory would be forbidden by the scope anyway, and a clear refusal at
/// pick time beats an unexplained read failure afterwards. Canonical on
/// both sides, like `covered_by`. An empty `folder` overlaps everything, so
/// a damaged value fails closed here too.
pub fn overlaps(folder: &Path, protected: &Path) -> bool {
    folder.as_os_str().is_empty() || protected.starts_with(folder) || folder.starts_with(protected)
}

/// Read the record. A missing or unreadable file is an empty set: the
/// first launch has no record, and a corrupt one must refuse everything
/// rather than allow anything.
pub fn load(file: &Path) -> Vec<PathBuf> {
    std::fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

/// Add one folder to the record, creating the config directory on first
/// use. Duplicates are dropped so re-picking the same vault does not grow
/// the file. Written whole, not appended: the file is tiny and a partial
/// JSON array would be read as "no vaults" by `load`.
pub fn remember(file: &Path, folder: &Path) -> std::io::Result<()> {
    let mut known = load(file);
    if !known.iter().any(|k| k == folder) {
        known.push(folder.to_path_buf());
    }
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let entries: Vec<String> = known.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let text = serde_json::to_string_pretty(&entries).map_err(std::io::Error::other)?;
    std::fs::write(file, text)
}

/// Canonicalize every recorded folder, dropping the ones that no longer
/// exist. A moved vault cannot be matched against anyway, and keeping a
/// stale entry in the comparison would only make the error message worse.
pub fn canonical_known(file: &Path) -> Vec<PathBuf> {
    load(file)
        .iter()
        .filter_map(|p| std::fs::canonicalize(p).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("novella-known-vaults-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn exact_and_nested_paths_are_covered() {
        let known = vec![PathBuf::from("/home/w/novel")];
        assert!(covered_by(&known, Path::new("/home/w/novel")));
        assert!(covered_by(&known, Path::new("/home/w/novel/chapters/01.md")));
        assert!(!covered_by(&known, Path::new("/home/w")));
        assert!(!covered_by(&known, Path::new("/home/w/novel-2")));
        assert!(!covered_by(&known, Path::new("/")));
    }

    #[test]
    fn empty_record_and_empty_entries_refuse_everything() {
        assert!(!covered_by(&[], Path::new("/home/w/novel")));
        // An empty path is a prefix of every path; it must not be a wildcard.
        assert!(!covered_by(&[PathBuf::from("")], Path::new("/home/w/novel")));
    }

    #[test]
    fn folders_that_would_expose_or_sit_in_the_record_dir_are_caught() {
        let config = Path::new("/home/w/.config/ai.novella.app");
        // The home folder, the filesystem root and the config dir itself
        // would all put the record inside a recursive grant.
        assert!(overlaps(Path::new("/home/w"), config));
        assert!(overlaps(Path::new("/"), config));
        assert!(overlaps(config, config));
        assert!(overlaps(Path::new(""), config));
        // A vault inside the config dir would be forbidden by the scope.
        assert!(overlaps(Path::new("/home/w/.config/ai.novella.app/sub"), config));
        // An ordinary vault — including one whose name shares a prefix
        // with the config path — does not.
        assert!(!overlaps(Path::new("/home/w/novel"), config));
        assert!(!overlaps(Path::new("/home/w/.config/ai.novella.app-old"), config));
        assert!(!overlaps(Path::new("/home/w/.config"), Path::new("/home/w/.configs/x")));
    }

    #[test]
    fn record_round_trips_and_dedupes() {
        let dir = scratch("roundtrip");
        let file = dir.join("nested").join(FILE_NAME);
        assert!(load(&file).is_empty());

        remember(&file, Path::new("/home/w/novel")).unwrap();
        remember(&file, Path::new("/home/w/novel")).unwrap();
        remember(&file, Path::new("/home/w/other")).unwrap();
        assert_eq!(
            load(&file),
            vec![PathBuf::from("/home/w/novel"), PathBuf::from("/home/w/other")]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_record_reads_as_empty() {
        let dir = scratch("corrupt");
        let file = dir.join(FILE_NAME);
        std::fs::write(&file, "[\"/home/w/novel\"").unwrap();
        assert!(load(&file).is_empty());
        std::fs::write(&file, "{\"not\": \"a list\"}").unwrap();
        assert!(load(&file).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn canonical_known_drops_missing_folders_and_resolves_real_ones() {
        let dir = scratch("canon");
        let real = dir.join("vault");
        std::fs::create_dir_all(&real).unwrap();
        let file = dir.join(FILE_NAME);
        remember(&file, &real).unwrap();
        remember(&file, &dir.join("gone")).unwrap();

        let known = canonical_known(&file);
        assert_eq!(known, vec![std::fs::canonicalize(&real).unwrap()]);
        // The check the command makes, end to end: a note inside the vault
        // passes, the vault's parent does not.
        let note = real.join("chapters");
        std::fs::create_dir_all(&note).unwrap();
        assert!(covered_by(&known, &std::fs::canonicalize(&note).unwrap()));
        assert!(!covered_by(&known, &std::fs::canonicalize(&dir).unwrap()));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
