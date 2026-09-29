# Security posture

Where Novella stands today, and what is deliberately not built yet. Written
plainly so it can be checked against reality rather than trusted.

## Principles

1. **The manuscript never leaves the machine unless the writer asks.** No
   telemetry, no analytics, no background uploads. The free tier has no
   account and no server to talk to.
2. **If sync ships, it is end-to-end encrypted.** The server stores
   ciphertext. Novella's operator must not be able to read a customer's
   novel — not for support, not for debugging, not under subpoena.
3. **No security theatre.** No login button that authenticates against
   nothing; no "encrypted" label on plaintext.

## What is in place

**Filesystem access is scoped at runtime, and only to folders a native
picker returned.** The desktop app ships with *no* filesystem permissions.
`src-tauri/capabilities/default.json` grants the fs verbs but no path scope,
so every read is denied until the writer picks a folder. The folder picker
itself runs in Rust — `pick_vault_folder` in `src-tauri/src/lib.rs` — and
the folder the OS dialog returns is recorded in `known_vaults.json` in the
app's config directory (`src-tauri/src/known_vaults.rs`) before the scope is
widened to that one directory. Reopening a remembered project goes through
`allow_vault`, which compares canonical paths and refuses anything that is
not in that record or inside one. The webview can ask for the picker as
often as it likes, but it cannot choose what the picker returns, so a folder
the writer never chose in an OS dialog stays unreadable even to a
compromised webview. Before this, `allow_vault` widened the scope to any
path the webview named, which made the empty capability scope decorative.

The record is guarded twice, because a webview that could write to it could
grant itself anything: the config directory is forbidden in the fs scope at
startup (forbidden beats allowed), and the picker refuses a folder that
contains the config directory — a home folder, a drive root — or sits
inside it. What the gate cannot stop is a compromised page persuading the
writer to pick a folder they would not otherwise open; the OS dialog is the
writer's own consent, and that is the line this draws.

**Every project opened before this change needs one confirmation.** Its
folder was chosen by the old JS dialog, so it is not in the record, and
trusting the webview's project list to fill the record would reopen the
hole. Instead, when `allow_vault` refuses a remembered project
(`src/storage/reauthorize.ts`), the picker opens already standing in that
project's folder under the title "Confirm your project folder"; one click
confirms it, and it is remembered from then on. Cancelling leaves the
project closed, with a message pointing at Projects → Open a folder…

Two honest caveats. The export save path (`allow_export_file`) still takes a
path from the webview. The dialog plugin's own `save` command already scopes
the chosen file itself, so the fix is to delete that command and its one
call in `src/export/save.ts`; it is next. And this change was written on a
machine without the desktop toolchain: the record's path logic is covered
by Rust unit tests and the webview side by `test-vaultscope.ts`, and the
crate type-checks against the Windows target, but it had not been built or
run when this paragraph was written — until the owner's build confirms it,
read it as the design rather than a verified property.

**Content Security Policy.** `tauri.conf.json` sets a strict policy:
`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, and
`connect-src` limited to the app itself, the Tauri IPC bridge, and
`localhost:11434` for Ollama. This matters because the webview renders two
kinds of untrusted text — Markdown from disk and output from a language
model — and shares a process boundary with the filesystem bridge.

`style-src` allows `'unsafe-inline'`. CodeMirror injects stylesheets at
runtime and cannot work without it. Inline *styles* cannot execute code; the
dangerous directive is `script-src`, which stays locked to `'self'`.

**`connect-src` allows `https:` — a deliberate loosening, worth understanding.**
Custom AI providers let a writer point Novella at any OpenAI-compatible
endpoint, which cannot be enumerated ahead of time. The alternatives were a
hardcoded list of vendors (breaks the moment a new service appears, and makes
the app the arbiter of who a customer may use) or routing every AI request
through Rust.

Routing through Rust is the better answer and is the intended fix: the webview
would lose network reach entirely, and `connect-src` could drop back to
localhost only. Until then, note what still holds — `script-src 'self'` means
no injected code runs in the first place, so this is defence-in-depth rather
than the primary control. Plain `http:` is allowed only for localhost, and the
custom provider refuses outright to send a manuscript or an API key over
non-local plain HTTP.

**`frame-src` allows four music hosts — the only frames the app can load.**
The music dock embeds the official players from Spotify, YouTube (nocookie
domain), SoundCloud and Apple Music, at the writer's request, using their own
iframes. The allowlist is exactly those four origins; no other frame can load,
`frame-ancestors 'none'` still forbids anything from framing Novella itself,
and no audio API, credential, or playback token ever passes through the app —
any login happens inside the platform's own iframe.

**API keys never touch localStorage or any file Novella writes.**
`ScopedSettings` in `src/plugins/runtime.ts` keeps any field marked
`secret` in memory, and on the desktop build persists it in the **OS
credential store** (Windows Credential Manager / macOS Keychain / Linux
keyutils) via three Rust commands over the `keyring` crate — the same
place your OS keeps Wi-Fi passwords, guarded by your login. The browser
build has no such safe, so there secrets remain session-only by design.
The round-trip (set → get → delete → gone) is covered by a Rust test
against the real credential store.

## Where your words live (audited 2026-07-23)

A full pass over every storage and network path in the app, so the answer to
"is my work safe?" is specific rather than reassuring:

**On disk (desktop):** the vault folder you chose — plain Markdown plus a
`.novella/` folder for history, covers, plot threads, agents and boards.
Unencrypted by design: they are your files, readable by any editor, covered
by whatever disk encryption your OS provides.

**In the browser build:** the same shape inside IndexedDB, plus draft
snapshots and preferences in localStorage. Same-origin protected, cleared if
site data is cleared — which is why the projects screen says so, and why the
full backup exists.

**What ever leaves the machine:** exactly three things, all user-initiated —
prompts and referenced codex entries to the AI provider *you* configured
(local Ollama by default, in which case nothing leaves at all); a version
check to `api.github.com` when you press "Check for updates"; and the music
player iframes (Spotify/YouTube/SoundCloud/Apple only, enforced by
`frame-src`). There is no analytics, no telemetry, no phone-home.

**Layered protection against loss:** autosave (1.5s after typing stops),
keystroke-level draft snapshots with crash recovery, revision history at
every decision point (before AI writes, on save, before restores), and a
one-click **full-project backup** — a plain .zip of everything including
`.novella/`, restorable by simple extraction. Four layers, because they fail
differently.

**Audit findings, this pass:** no `innerHTML`/`dangerouslySetInnerHTML`
anywhere (model output and imported files render as text, never as markup);
no `eval`; the secret-field write path verified to divert to memory and
the OS credential store, never localStorage; every `fetch` target
enumerated and accounted for.
One note: `src/core/plugins.ts` contains an unregistered Phase-1 provider
with an unreachable `fetch` to api.anthropic.com — dead code, no path calls
it; left in place because that file is the protected Phase-1 engine surface.

**Unsaved work survives a crash.** Draft snapshots are written to
localStorage on every keystroke and offered back on next launch. Autosave
writes to disk 1.5s after typing stops when a vault folder is open.

**Rendering is escape-by-default.** No `dangerouslySetInnerHTML` anywhere.
AI output and file contents are rendered as text nodes, so a manuscript
containing `<script>` is prose, not an instruction.

## Not yet built — do not assume these

- **No code signing.** Installers are unsigned, so Windows SmartScreen will
  warn on install and the app will look untrusted. A certificate must be
  purchased before public distribution.
- **No auto-update.** Shipping a fix means users manually reinstalling.
- **No accounts, no sync, no server.** Nothing to log into. Any UI suggesting
  otherwise would be a lie.
- **The vault is not encrypted at rest.** Files are plain Markdown, which is
  the entire point of the format — portable and readable in fifty years. Disk
  encryption is the operating system's job (BitLocker, FileVault).
- **No privacy policy or terms.** Required before taking payment or storing
  anyone's data.

## If sync is built

Non-negotiables, decided before any code:

- Encrypt client-side. The server receives ciphertext and never holds a key
  capable of decrypting it.
- Derive keys from a passphrase the user controls, separate from their login
  password. Losing it means losing the data — say so bluntly at setup, and
  do not offer a recovery path that would require holding the key.
- Never silently overwrite prose on conflict. Write a conflict copy and let
  the writer choose. Losing a paragraph to a merge is unforgivable in a tool
  people trust with a novel.
- Keep the free tier fully functional offline with no account.

## Reporting a problem

Email **drewpmedia@gmail.com** with "Novella security" in the subject.
Please include what you did, what happened, and the version from
Settings → About. A proof-of-concept helps but is not required.

Expect an acknowledgement within **7 days** and an assessment within
**30**. Novella is maintained by one person, so that is a realistic
promise rather than a generous one; if a fix will take longer, you will
be told where it stands rather than left waiting.

Please report privately first and give a reasonable window before
publishing. There is no bug bounty — this is a free, open-source project
with no revenue behind it — but credit is given in the release notes for
anything reported this way, unless you would rather not be named.

**What is in scope.** Anything that could expose a writer's manuscript or
credentials: the vault reader and writer, the path gate in
`src-tauri/src/lib.rs`, the Tauri capability set, the CSP, the OS
credential-store integration, the export and import paths, and the plugin
sandbox. Anything that reaches the network without the writer asking is
in scope by definition — see "What leaves this machine" above.

**What is not.** Findings that require an attacker to already have the
writer's unlocked machine; the unsigned installers (a known, documented
trade-off — see the README); and denial-of-service against a local-only
desktop app with no server to exhaust.

> **NEEDS OWNER (free, one setting):** GitHub's private vulnerability
> reporting is currently **disabled** on this repository, so the email
> above is the only private channel. Turning it on — Settings → Code
> security → Private vulnerability reporting — gives reporters a proper
> advisory workflow. Add the link here once it is enabled.
