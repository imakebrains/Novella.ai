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

**Filesystem access is scoped at runtime.** The desktop app ships with *no*
filesystem permissions. `src-tauri/capabilities/default.json` grants the fs
verbs but no path scope, so every read is denied until the writer picks a
folder. The `allow_vault` command in `src-tauri/src/lib.rs` then widens the
scope to that one directory for the session. A folder never opened stays
unreadable, even to a compromised webview.

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

**API keys are never written to disk.** `ScopedSettings` in
`src/plugins/runtime.ts` keeps any field marked `secret` in memory only.
Non-secret settings go to localStorage; secrets never do. The cost is
re-entering a key each session — see "Not yet built".

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
never touch localStorage; every `fetch` target enumerated and accounted for.
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
- **No OS keychain.** Secrets live in memory for the session only. Safe, but
  inconvenient, and it blocks practical use of paid AI providers.
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

Not yet applicable — there is no public release. Before one, this section
needs a contact address and a stated response window.
