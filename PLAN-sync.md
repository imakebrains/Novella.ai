# PLAN: End-to-end encrypted sync (and, later, accounts)

Status: **plan only — nothing here is built.** Written 2026-07-23 so the
owner can make the three decisions at the bottom before any code exists.
Everything above that section is engineering reality, not opinion.

## What this buys

The same book on two machines (desk + laptop, or desktop + browser),
without Novella ever being able to read a word of it. It also unblocks
the two most-requested "account" features honestly: device pairing and,
if ever wanted, billing. Novella currently has no server and SECURITY.md
promises exactly three network egress points — sync must not quietly
break that promise; it adds a fourth, documented, opt-in one.

## Non-negotiables (from the thesis)

1. **Files stay the source of truth.** Sync moves the same Markdown that
   lives in the folder; deleting the account leaves the folder whole.
2. **Offline is not a degraded mode.** Everything works with sync off;
   sync is a background courier, not a foundation.
3. **Zero-knowledge server.** The server stores ciphertext and sizes.
   No plaintext titles, no plaintext filenames, no readable word counts.
4. **Leaving stays easy.** One click already exports the whole project
   as a zip; that never changes.

## Architecture (the short version)

- **Unit of sync:** the project folder, as a content-addressed set of
  encrypted chunks plus an append-only, per-project journal of
  "path → chunk list" entries. The existing `.novella/` config rides
  along like any other files.
- **Crypto:** libsodium. Per-project symmetric key (XChaCha20-Poly1305);
  the key is derived once (Argon2id) from a generated passphrase shown
  to the writer as a 12-word **recovery kit** — the server never sees
  it. Pairing a second device = typing the words there. No email needed.
- **Conflicts:** never merged silently. If two machines edited the same
  file apart, both versions are kept (`Chapter-7 (conflict from
  laptop).md`) and the History diff view already shows what differs.
  Boring, provable, loses nothing.
- **Server:** deliberately dumb — authenticated PUT/GET of blobs and an
  append log with compare-and-swap. Small enough to write in a weekend
  in any stack; small enough to audit in an afternoon.

## Hosting options (pick one in decision 1)

| Option | Monthly cost (≤100 users) | Ops burden | Notes |
|---|---|---|---|
| A. Tiny VPS + S3-compatible storage (Hetzner/Fly + B2) | ~$10–20 | Low, but ours | Full control; the plan above fits it exactly |
| B. Supabase (storage + edge functions + auth) | ~$25 | Lowest | Fastest to ship; auth built in if accounts come later |
| C. No server: folder lives in the user's own Dropbox/Drive/Syncthing | $0 | None | Ship a "safe for cloud folders" mode (atomic writes, lockfile); weakest UX but zero custody |

Recommendation: **start with C** (it is mostly hardening we should do
anyway), ship it, and let real demand justify A or B. C requires no
owner accounts, no billing, and no privacy policy work.

## Phasing

1. **C-mode hardening** — atomic file writes, a `.novella/lock` heartbeat
   so two machines don't write simultaneously, conflict-copy naming.
   No server, no keys, buildable now.
2. **Manual push/pull** against option A or B — one button, visible
   status, recovery-kit pairing. Only after decision 1.
3. **Background sync** — watcher + debounce on top of 2.
4. **Accounts** (only if ever needed for billing/support) — magic-link
   email first; Google OAuth is a NEEDS OWNER item (cloud project,
   consent screen) and never a data-access mechanism.

## NEEDS OWNER — the three decisions

1. **Hosting:** A, B, or C above (recommendation: C first).
2. **Custody:** are we ever willing to run a server that holds user
   ciphertext + billing identity? If "no", C is the permanent answer
   and accounts never exist.
3. **Money:** if A/B, which card/account pays for hosting, and does sync
   become the first paid feature? (Free-while-beta is fine, but decide
   before strangers depend on it.)

Nothing in this file is scheduled until those three have answers.
