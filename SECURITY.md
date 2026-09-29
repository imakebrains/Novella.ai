# Security posture

Where Novella stands today, and what is deliberately not built yet. Written
plainly so it can be checked against reality rather than trusted.

## Principles

1. **The manuscript never leaves the machine unless the writer asks.** No
   telemetry, no analytics, nothing uploaded the writer did not choose.
   Without an account — the default, and fully usable — there is no server
   to talk to at all. With the optional account, only the books the writer
   chose to sync go up.
2. **Synced books are private to their account, and not end-to-end
   encrypted — said plainly.** Every table that holds a writer's data has
   row-level security with one rule, that the row belongs to the signed-in
   account (`owner_id = auth.uid()`, or `user_id`), and the private `vault`
   storage bucket checks the first folder of every object's path against
   the same id. `supabase/tests/isolation_test.sql` proves one account can
   neither read nor write another's; it runs against a real Postgres with
   `npm run test:cloud-db` and is not part of `npm run verify`, because CI
   has no Postgres. That keeps other accounts out; it does
   not keep out whoever operates the Supabase project. Novella adds no
   encryption of its own, and the service-role key the server functions
   run with bypasses row-level security. Earlier versions of this page
   promised that the operator could never read a customer's novel. The sync
   that was built does not keep that promise, and until client-side
   encryption exists, anyone operating the project can read stored books.
3. **No security theatre.** No login button that authenticates against
   nothing; no "encrypted" label on plaintext.

## What is in place

**Filesystem access is scoped at runtime, and only to folders a native
picker returned.** The desktop app ships with *no* filesystem permissions.
`src-tauri/capabilities/default.json` grants the fs verbs but no path scope,
so every read is denied until the writer picks a folder. The folder picker
itself runs in Rust — `pick_vault_folder` in `src-tauri/src/lib.rs` — and
the folder the OS dialog returns is recorded in `known_vaults.json` in the
app's config directory (`%APPDATA%\ai.novella.app` on Windows;
`src-tauri/src/known_vaults.rs`) before the scope is widened to that one
directory. The widening grants both the canonical and the literal spelling
of the folder, because the fs scope matches a file that does not exist yet
— every save's temp file — against the literal path, and a mapped, subst or
symlinked root is never already canonical; the literal spelling is added
only after its canonical form has passed the check. Reopening a remembered
project goes through `allow_vault`, which compares canonical paths and
refuses anything that is not in that record or inside one. The webview can
ask for the picker as often as it likes, but it cannot choose what the
picker returns, so a folder the writer never chose in an OS dialog stays
unreadable even to a compromised webview. Before this, `allow_vault`
widened the scope to any path the webview named, which made the empty
capability scope decorative.

The record is guarded twice, because a webview that could write to it could
grant itself anything: the config directory is forbidden in the fs scope at
startup (forbidden beats allowed; if that fails it is logged, and the second
guard still holds), and the picker refuses a folder that contains the config
directory — a home folder, a drive root — or sits inside it. What the gate
cannot stop is a compromised page persuading the writer to pick a folder
they would not otherwise open; the OS dialog is the writer's own consent,
and that is the line this draws.

**Every project opened before this change needs one confirmation.** Its
folder was chosen by the old JS dialog, so it is not in the record, and
trusting the webview's project list to fill the record would reopen the
hole. Instead, when `allow_vault` refuses a remembered project
(`src/storage/reauthorize.ts`), the picker opens already standing in that
project's folder under the title "Confirm your project folder — Novella now
asks once per folder"; one click confirms it, and it is remembered from
then on. Cancelling leaves the project closed, with a message pointing at
Projects → Open a folder…

Two honest caveats. The export save path (`allow_export_file`) still takes a
path from the webview. The dialog plugin's own `save` command already scopes
the chosen file itself, so the fix is to delete that command and its one
call in `src/export/save.ts`; it is next. And this change was written on a
machine without the desktop toolchain: the record's path logic is covered
by Rust unit tests and the webview side by `test-vaultscope.ts`, and the
crate type-checks against the Windows target, but it had not been built or
run when this paragraph was written — until the owner's build confirms it,
read it as the design rather than a verified property.

**Content Security Policy.** `src-tauri/tauri.conf.json` sets a strict
policy: `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
and `connect-src` set to `'self' ipc: http://ipc.localhost https:
http://localhost:* http://127.0.0.1:*` — the app itself, the Tauri IPC
bridge, any HTTPS origin (see below) and plain HTTP to this machine only,
which is where Ollama listens. This matters because the webview renders two
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
through Rust. The same `https:` is how the update check reaches
`api.github.com`, and how a build with the optional cloud reaches its
Supabase project.

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
against the real credential store. API keys never sync, with or without
an account.

**The cloud session follows the same rule where the platform has a
keychain.** Signing in to the optional account leaves a session whose
refresh token can mint new access for that account until it is revoked.
On the desktop it is split (`src/cloud/sessionStorage.ts`): the refresh
token alone goes to the OS keychain through the same three commands
(`src/cloud/keychainSecrets.ts`), and the rest — an access token that
expires within the hour and the public profile — sits in localStorage
under `novella.cloud.session`. The split exists because Windows Credential
Manager refuses secrets over 2,560 bytes and a session carrying a Google
profile routinely exceeds that. If the keychain half is missing the whole
session reads as absent, which signs the writer out rather than leaving a
half-valid session. The browser build has no keychain, so there the whole
session, refresh token included, lives in that browser's localStorage —
the same place supabase-js keeps it by default.

## Where your words live (audited 2026-07-23)

Updated 2026-09-29 for the optional cloud.

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

**In the cloud (only with an account, only books you chose to sync):** the
schema is `supabase/migrations/20260923000000_cloud_sync.sql`. Text files
are stored inline in Postgres, in `project_files`; binary files such as
covers and card images go to the private `vault` bucket under
`<owner>/<project>/<sha256>`. Beside each file the server keeps its path,
size, hash and the label of the device that last saved it ("Windows
desktop"). It also holds your email — plus your name and avatar address
for a Google sign-in — your plan, and `ai_usage`: the cost and token
counts of Novella AI requests, never their text. Row-level security keeps
every other account out. The stored books are not end-to-end encrypted,
and the project's operator can read them (principle 2).

**What ever leaves the machine,** all of it started by the writer:

- prompts and referenced codex entries to the AI provider *you* configured
  (local Ollama by default, in which case nothing leaves at all);
- a version check to `api.github.com`, only when you press "Check for
  updates";
- the music player iframes (Spotify/YouTube/SoundCloud/Apple only,
  enforced by `frame-src`);
- a calendar feed you subscribed to, fetched when you subscribe or press
  refresh;
- and, only with an account: sign-in (your email to the project's Supabase
  Auth, or Google in the browser build); sync of the books you chose, which
  then runs in the background; Novella AI prompts, which
  `supabase/functions/ai/index.ts` forwards to Anthropic with a key held
  only in the function's secrets; and Upgrade or Manage subscription,
  where `supabase/functions/create-checkout/index.ts` asks Paddle for a
  checkout tied to your account and payment happens on Paddle's own page.

There is no analytics, no telemetry, no phone-home.

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
- **The cloud is built but off.** Accounts and sync exist in code and are
  off in every build until the two values in `.env.example` are set
  (`src/cloud/config.ts`); none of it has yet run against a live project.
  A build without them — the cloud is off — has nothing to log into, and
  any UI there suggesting otherwise would be a lie.
- **No end-to-end encryption for synced books.** The server stores readable
  text (principle 2).
- **The vault is not encrypted at rest.** Files are plain Markdown, which is
  the entire point of the format — portable and readable in fifty years. Disk
  encryption is the operating system's job (BitLocker, FileVault).
- **No privacy policy or terms in force.** Drafts exist in
  `docs/legal/PRIVACY.md` and `docs/legal/TERMS.md`; they are required
  before anyone outside the owner signs in, and before taking payment.

## Sync, as built

What was decided before any code, and what the code does:

- **Kept: conflicts write a copy, never overwrite.** When one file was
  edited in two places, this device's text stays and the other lands beside
  it as a "conflicted copy" for the writer to resolve
  (`src/cloud/syncEngine.ts`).
- **Kept: nothing is deleted by accident.** A file that merely disappears is
  never deleted from the cloud — only a deletion Novella itself made is sent
  up — and more than ten deletions that are also more than a quarter of the
  book wait for the writer to confirm.
- **Kept: every download is checked** against the hash the server holds
  before it is written, so a truncated transfer cannot become the chapter.
- **Kept: the app stays fully functional offline without an account.**
  Every device keeps a full working copy either way.
- **Kept: the writer can leave.** Settings → Account → Download everything
  zips every synced book and the synced settings on the writer's own device
  (`src/cloud/downloadEverything.ts`); Delete account
  (`supabase/functions/delete-account/index.ts`) asks for the account's
  email, refuses while a paid subscription is still live, removes the
  stored files first and then the sign-in, which cascades to every row.
  Books on the writer's own devices are untouched.
- **Not kept: client-side encryption with a passphrase the writer
  controls.** It is not built. The server stores readable text, not
  ciphertext, and holds everything needed to read it.

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
credential-store integration and the cloud session split, the export and
import paths, the plugin sandbox, the cloud schema and its row-level
security (`supabase/migrations/`), and the server functions
(`supabase/functions/`). Anything that reaches the network without the
writer asking is in scope by definition — see "Where your words live"
above.

**What is not.** Findings that require an attacker to already have the
writer's unlocked machine; the unsigned installers (a known, documented
trade-off — see the README); and denial-of-service against the desktop
app itself.

> **NEEDS OWNER (free, one setting):** GitHub's private vulnerability
> reporting is currently **disabled** on this repository, so the email
> above is the only private channel. Turning it on — Settings → Code
> security → Private vulnerability reporting — gives reporters a proper
> advisory workflow. Add the link here once it is enabled.
