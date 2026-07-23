use tauri_plugin_fs::FsExt;

/// Grant filesystem access to exactly the folder the user chose.
///
/// The capability file deliberately ships no path scope, so the app starts
/// with access to nothing. After the folder picker returns, the frontend
/// calls this to widen the scope to that one directory for this session.
/// A vault the user never opened stays unreadable.
#[tauri::command]
fn allow_vault(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())
}

/// Grant write access to one file the user chose in a save dialog.
///
/// Exports land outside the vault, which the scope from `allow_vault`
/// doesn't cover — so without this every export would be denied. Scoped to
/// the single file the user actually picked, not its directory.
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
