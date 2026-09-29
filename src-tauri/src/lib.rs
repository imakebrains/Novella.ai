mod known_vaults;

use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

/// The app's config directory — `%APPDATA%\ai.novella.app` on Windows —
/// created if missing and canonicalized, so it can be compared against
/// canonical vault paths and forbidden in the scope by its real name.
fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::canonicalize(&dir).map_err(|e| e.to_string())
}

/// Where the record of picker-returned folders lives. Inside the config
/// directory, which `run` forbids in the fs scope — see known_vaults.rs.
fn known_vaults_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(known_vaults::FILE_NAME))
}

/// Open the OS folder picker from Rust, record the choice, widen the fs
/// scope to it and hand the path back. The webview may ask for the picker
/// as often as it likes; it cannot choose what the picker returns.
///
/// `default_path` only sets where the dialog starts — the writer still has
/// to confirm a folder, so it grants nothing. It exists so a project picked
/// before this record did can be re-confirmed in one click. The title is
/// fixed here rather than taken from the webview, so the dialog's wording
/// is ours even when the page asking for it is not.
///
/// `async` so the blocking picker runs on the async runtime's pool rather
/// than the main thread — the dialog plugin's own `open` command is built
/// the same way. Returns `None` when the writer cancels.
#[tauri::command]
async fn pick_vault_folder(
    app: tauri::AppHandle,
    window: tauri::Window,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let title = if default_path.is_some() {
        "Confirm your project folder — Novella now asks once per folder"
    } else {
        "Choose your vault folder"
    };
    let dialog = app.dialog().file().set_title(title);
    // Parenting makes the picker modal to the main window. The plugin only
    // does this on Windows and macOS, so match it: on Linux a parented GTK
    // dialog from a non-main thread is the case that hangs.
    #[cfg(any(windows, target_os = "macos"))]
    let dialog = dialog.set_parent(&window);
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = &window;
    let dialog = match default_path.as_deref().map(Path::new) {
        Some(start) if start.is_dir() => dialog.set_directory(start),
        _ => dialog,
    };

    let Some(picked) = dialog.blocking_pick_folder() else {
        return Ok(None);
    };
    // simplified() drops the Windows verbatim prefix, so the string the
    // project list stores looks like the one the JS picker used to return —
    // projectStore dedupes by exact path, so a re-confirmed project keeps
    // its one entry instead of gaining a twin.
    let path = picked.simplified().into_path().map_err(|e| e.to_string())?;
    let canonical = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if known_vaults::overlaps(&canonical, &config_dir(&app)?) {
        return Err(format!(
            "Novella can't use {} as a project folder: it holds, or sits inside, \
             Novella's own settings. Choose a folder of its own for the project.",
            path.display()
        ));
    }
    known_vaults::remember(&known_vaults_file(&app)?, &path).map_err(|e| e.to_string())?;
    app.fs_scope()
        .allow_directory(&canonical, true)
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Re-grant a folder the writer chose in an earlier session.
///
/// The capability file deliberately ships no path scope, so the app starts
/// with access to nothing. This widens it — but only to a folder a native
/// picker returned (recorded by `pick_vault_folder`), or somewhere inside
/// one. Anything else is refused, whatever the webview says: a folder the
/// writer never chose stays unreadable even to a compromised webview.
/// Canonical on both sides, so `..`, symlinks and mixed separators cannot
/// talk their way past the comparison.
///
/// src/storage/reauthorize.ts recognises the refusal by its wording to offer
/// the one-click re-confirm, so change the two together.
#[tauri::command]
fn allow_vault(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let asked = std::fs::canonicalize(&path).map_err(|_| {
        format!(
            "Novella can't find the folder {path}. It may have been moved or renamed — \
             choose it again from Projects → Open a folder…"
        )
    })?;
    let known = known_vaults::canonical_known(&known_vaults_file(&app)?);
    if !known_vaults::covered_by(&known, &asked) {
        return Err(format!(
            "Novella won't open {path}: it isn't a folder you chose with the folder picker. \
             Choose it again from Projects → Open a folder…"
        ));
    }
    app.fs_scope()
        .allow_directory(&asked, true)
        .map_err(|e| e.to_string())
}

/// Grant write access to one file the user chose in a save dialog.
///
/// Exports land outside the vault, which the scope from `allow_vault`
/// doesn't cover — so without this every export would be denied. Scoped to
/// the single file the user actually picked, not its directory.
///
/// Same shape of trust as the old allow_vault: it believes the webview's
/// path. The dialog plugin's own `save` command already scopes the file the
/// writer picked, so closing this is a deletion — see SECURITY.md.
#[tauri::command]
fn allow_export_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())
}

/// Print a message from the webview to the dev-server terminal.
///
/// WebView2 devtools are awkward to read from an automated session, and the
/// window is easy to lose among the helper windows Tauri creates. Routing
/// diagnostics through Rust stdout puts them in the `tauri dev` output where
/// they can be read as a plain file.
#[tauri::command]
fn debug_log(message: String) {
    println!("[novella] {message}");
}

/* ---------- local AI engine setup ----------

   The one-install rule: the writer installs Novella and nothing else.
   The local AI engine is fetched on request, from inside the app.

   Installation goes through winget rather than a downloader written here.
   winget verifies the installer's hash against a signed Microsoft-hosted
   manifest and is itself a signed Microsoft binary — which means no
   bespoke download-and-execute code of ours sits in the trust path. If
   winget is unavailable we say so and let the user decide, rather than
   silently falling back to fetching an executable from the internet. */

#[cfg(windows)]
const NO_WINDOW: u32 = 0x0800_0000; // CREATE_NO_WINDOW — no console flash

fn command(program: &str) -> std::process::Command {
    let cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(NO_WINDOW);
        return cmd;
    }
    #[allow(unreachable_code)]
    cmd
}

/// Is the Ollama binary present on this machine?
#[tauri::command]
fn ollama_installed() -> bool {
    command("ollama").arg("--version").output().is_ok()
}

/// Is winget available to install things with?
#[tauri::command]
fn winget_available() -> bool {
    command("winget").arg("--version").output().is_ok()
}

/// Install Ollama. Blocks until finished; the UI shows a spinner.
#[tauri::command]
async fn install_ollama() -> Result<String, String> {
    if ollama_installed() {
        return Ok("already installed".into());
    }
    if !winget_available() {
        return Err(
            "winget isn't available on this machine, so Novella can't install the AI engine for you. \
             You can install Ollama yourself from ollama.com and Novella will pick it up automatically."
                .into(),
        );
    }

    let out = command("winget")
        .args([
            "install",
            "--id",
            "Ollama.Ollama",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--disable-interactivity",
        ])
        .output()
        .map_err(|e| format!("Couldn't start the installer: {e}"))?;

    if out.status.success() {
        Ok("installed".into())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        let detail = if stderr.trim().is_empty() { stdout } else { stderr };
        Err(format!("Install failed: {}", detail.trim()))
    }
}

/// Start the Ollama service if it's installed but not running.
#[tauri::command]
fn start_ollama() -> Result<(), String> {
    command("ollama")
        .arg("serve")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Couldn't start Ollama: {e}"))
}

/* ---------- OS keychain for provider secrets ----------

   API keys were deliberately memory-only until they could live somewhere
   actually safe. This is that somewhere: Windows Credential Manager /
   macOS Keychain / the Linux keyutils service, via the audited `keyring`
   crate. Keys never touch localStorage or any file we write. */

const KEYCHAIN_SERVICE: &str = "com.novella.app";

#[tauri::command]
fn secret_set(name: String, value: String) -> Result<(), String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, &name)
        .and_then(|e| e.set_password(&value))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(name: String) -> Result<Option<String>, String> {
    match keyring::Entry::new(KEYCHAIN_SERVICE, &name).and_then(|e| e.get_password()) {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_delete(name: String) -> Result<(), String> {
    match keyring::Entry::new(KEYCHAIN_SERVICE, &name).and_then(|e| e.delete_credential()) {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    /// Round-trips a credential through the real OS store. If this passes
    /// on a machine, the keychain commands work on that machine — no app
    /// window required to prove it.
    #[test]
    fn keychain_round_trip() {
        let entry = keyring::Entry::new("com.novella.app.test", "probe").unwrap();
        entry.set_password("s3cret-probe").unwrap();
        assert_eq!(entry.get_password().unwrap(), "s3cret-probe");
        entry.delete_credential().unwrap();
        assert!(matches!(
            entry.get_password(),
            Err(keyring::Error::NoEntry)
        ));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            allow_vault,
            pick_vault_folder,
            allow_export_file,
            debug_log,
            ollama_installed,
            winget_available,
            install_ollama,
            start_ollama,
            secret_set,
            secret_get,
            secret_delete
        ])
        .setup(|app| {
            // Give the WINDOW its own icon.
            //
            // Windows draws a running app's taskbar button from the
            // window's icon, not the executable's. Without one set, this
            // window reported no ICON_BIG at all and only a 16x16
            // ICON_SMALL — so on a 4K screen at 250% scaling, where the
            // taskbar wants 60 pixels, Windows was enlarging a 16-pixel
            // image nearly four times. All the care in the .ico went to
            // the one icon nobody was looking at.
            //
            // 128 rather than the 1024 master: everything that uses the
            // window icon wants 40-96px, so this is a gentle reduction in
            // every case instead of a big one. Explorer still reads the
            // executable's .ico, which carries a native 256.
            {
                if let Some(window) = app.get_webview_window("main") {
                    match tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png")) {
                        Ok(icon) => {
                            if let Err(e) = window.set_icon(icon) {
                                log::warn!("could not set the window icon: {e}");
                            }
                        }
                        // Never fatal: a missing icon is a cosmetic
                        // problem, and refusing to start over one would
                        // be a real problem.
                        Err(e) => log::warn!("could not decode the window icon: {e}"),
                    }
                }
            }

            // Keep the record of picker-returned folders out of the webview's
            // reach. Forbidden beats allowed in the fs plugin, so even a vault
            // that somehow contained the config directory could not expose
            // known_vaults.json. pick_vault_folder refuses such a vault too;
            // this is the second lock, and failing to set it is logged rather
            // than fatal because the first one still holds.
            match (config_dir(app.handle()), app.try_fs_scope()) {
                (Ok(dir), Some(scope)) => {
                    if let Err(e) = scope.forbid_directory(&dir, true) {
                        log::warn!("could not fence off the config directory: {e}");
                    }
                }
                (Err(e), _) => log::warn!("could not resolve the config directory: {e}"),
                (_, None) => log::warn!("fs scope missing at setup; config directory not fenced"),
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
