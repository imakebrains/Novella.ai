# Novella in the cloud

Written 2026-09-23. This supersedes the three open decisions in
[PLAN-sync.md](../PLAN-sync.md): the owner answered them.

The short version: every book, and the settings that follow the writer,
live in the owner's cloud account, bound to the writer's sign-in. Every
device also keeps a full working copy, so writing never waits on the
network and never stops when the wifi does — the Google Docs offline
model, not the Dropbox one. Nobody can see anybody else's work, and the
database proves that rather than promising it.

---

## What the owner decided

| Question | Answer (2026-09-23) | What it means in the build |
|---|---|---|
| Privacy | Each person's work is theirs alone, bound to their account; no one can see anyone else's projects | Row level security on every table; one rule, `owner_id = auth.uid()`; 74 isolation checks against real Postgres |
| Sign-in | Bound to their Google account | Google sign-in through Supabase Auth, plus email magic links for people without Google |
| Offline | Cloud first, usable offline, "like Google Docs" | Local working copy on every device + background sync; offline is not a degraded mode |
| Plans | Free + Plus + Pro | Table below; paid tiers sell convenience, never the ability to write |
| Launch | The app stays private until the owner says publish | Nothing is deployed publicly by this work; the cloud is off in every build until configured |

## What is built, and how it was checked

Everything below is in the repo and tested. **None of it is switched on
yet** — there is no Supabase project, so every build still runs exactly
as before (no sign-in button, no sync). The cloud turns on when two
values are set (`.env.example`).

| Piece | Where | Verified by |
|---|---|---|
| Database schema, privacy rules, plan limits, save function | `supabase/migrations/20260923000000_cloud_sync.sql` | `supabase/tests/isolation_test.sql`: 74 checks on Postgres 16, run against a stub that reproduces Supabase's permissive default grants. Mutation-tested: letting one writer read another's projects, skipping the version check, or letting anyone look up another account's plan each fails the suite |
| Sync engine (offline copy, conflicts, deletions) | `src/cloud/syncEngine.ts` | `test-cloud.ts`: 157 checks, several devices against an in-memory server. Eight deliberate sabotages of the engine, each caught (one only after its test was tightened) |
| Engine against the real database | `supabase/tests/contract.ts` | 17 checks: the engine drives the real `push_file()` through psql, including an outsider who can neither read nor write the book |
| Row parsing, config, errors | `src/cloud/wire.ts`, `config.ts` | `test-cloud-server.ts` |
| Supabase connection (sign-in client, projects, files, blobs) | `src/cloud/supabaseRemote.ts` | Typechecked against supabase-js 2.116.0. **Not yet run against a live project** — needs the owner's project |
| Session storage (refresh token in the OS keychain) | `src/cloud/sessionStorage.ts` | `test-cloud-server.ts` |
| Built-in AI for Pro (server holds the key, meters use) | `supabase/functions/ai/`, `_shared/aiCore.ts`, `src/cloud/hostedAi.ts` | `test-cloud-server.ts` for every rule and the stream protocol; function typechecked against @anthropic-ai/sdk 0.112.4. **Not yet run live** — needs the owner's Anthropic key |
| Billing webhook (Paddle → plan) | `supabase/functions/billing-webhook/`, `_shared/billingCore.ts` | `test-cloud-server.ts`: forged, altered, replayed and rotated-secret signatures; every status; out-of-order and superseded subscriptions. **Payload field names not yet checked against a live Paddle sandbox delivery** |
| Plan table | `src/cloud/plans.ts` | `test-cloud.ts` parses the migration and fails if the app and the server disagree on any limit |

Run the database tests with any Postgres 15+ you can create databases
on: `PGHOST=… PGUSER=… npm run test:cloud-db`. They are not in
`npm run verify` because CI has no Postgres, and a gate that skips a
test when the server is missing reports green for a test that never ran.

## How it fits together

```
 Desktop app / browser tab                     Supabase (one bill)
 ┌───────────────────────────┐                 ┌──────────────────────────────┐
 │ Editor, codex, board …    │                 │ Auth: Google, email links    │
 │        │ saves           │                 │ Postgres                     │
 │        ▼                  │   push_file()   │   projects, project_files    │
 │ Working copy              │ ─────────────▶ │   user_settings, plans,      │
 │  desktop: the real folder │ ◀───────────── │   entitlements, ai_usage     │
 │  browser: IndexedDB       │   pull by seq   │   (every row: owner only)    │
 │        ▲                  │                 │ Storage: vault bucket        │
 │ Sync engine (background)  │ ─── blobs ───▶ │   <owner>/<project>/<sha256> │
 └───────────────────────────┘                 │ Functions:                   │
          │  Pro only: prompt + session token  │   ai  ──▶ Anthropic (key     │
          └──────────────────────────────────▶ │          held here only)     │
                                               │   billing-webhook ◀── Paddle │
                                               └──────────────────────────────┘
```

**The unit of sync is a file**, the same Markdown file that lives in the
book's folder. The cloud stores the current version of each file plus
a per-book change counter; a device asks for "everything since change
41" and gets exactly that, in order, with nothing skippable.

**Saving is compare-and-swap.** A device says which version its edit
was based on; the write lands only if that is still the current one.
Otherwise the server hands back the current text and the device decides.

**When the same chapter was edited in two places**, this device's text
stays where it is and the other one is saved beside it as
`Chapter 7 (Laptop conflicted copy 2026-09-23).md`. That name is one the
vault's existing detector already recognises, so the copy lands in the
Conflicts panel instead of being loaded as a second chapter with the
same id. Both files sync, so the writer resolves it once, anywhere.
Settings files under `.novella/` don't get a copy: the device that
syncs second keeps its version, because there is no sentence to show a
writer about a board layout.

**A file that merely disappears is never deleted from the cloud.** Only
a deletion Novella itself made is sent up. A folder that went missing
is restored from the cloud, not emptied into it. More than ten
deletions that are also more than a quarter of the book wait for the
writer to confirm.

**Every download is checked against the hash the server holds** before
it is written, so a truncated transfer can never become the chapter.

## What syncs, and what never does

| Kind | Examples | Syncs? |
|---|---|---|
| The book | chapters, codex entries, notes, prompts, templates | Yes — the file sync above |
| Book settings and history | `.novella/boards.json`, covers, card images, history, trash | Yes — same mechanism |
| Settings that follow the writer | theme, accent, prose font, motion | Yes — `user_settings`; **wiring is the next step** (see below) |
| Per-book state kept in the browser today | chat threads, calendar entries, sprint history | Yes, once moved into the book folder; **next step** |
| This computer only | window and pane sizes, crash-recovery drafts | No — they describe the machine, not the writer |
| API keys (Claude, OpenAI…) | | **Never.** They stay in the OS keychain on each device (CLAUDE.md). Pro users don't need one at all |
| The cloud session | | Refresh token in the OS keychain on desktop; the rest in local storage |

## Plans

Prices are drafts until the owner sets them in Paddle. Limits are
enforced by the server; the app only displays them.

| | Free | Plus | Pro |
|---|---|---|---|
| Price | $0 | $8/mo or $80/yr | $18/mo or $180/yr |
| The whole app (editor, codex, board, tasks, calendar, export) | ✓ | ✓ | ✓ |
| Books on your own computer | Unlimited | Unlimited | Unlimited |
| Books synced across devices | 1 | Unlimited | Unlimited |
| Cloud storage | 100 MB | 10 GB | 20 GB |
| AI with a local model or your own key | ✓ | ✓ | ✓ |
| Built-in AI, no key or setup | — | — | $6 of model use a month, with a meter |

After a downgrade nothing is deleted or hidden. Books past the plan's
count stay readable and simply stop accepting new changes (oldest keep
syncing); an account over its storage can still edit, shrink and delete.

**Where this sits in the market** (prices gathered 2026-09-23, mostly
from aggregators; check the live pages before quoting publicly):
NovelCrafter $4 / $8 / $14 / $20 a month and bring-your-own AI key;
Sudowrite $19 / $29 / $59 with credits; Notion Plus $10–12; Plottr $15.
Pro at $18 with AI included and nothing to set up undercuts Sudowrite's
entry tier and NovelCrafter's AI-capable tiers once their API bills are
added — the "advertised price isn't the real price" complaint RESEARCH.md
logged in round 1.

### The owner's call: which model powers built-in AI

The allowance is $6 of model cost a month. What that buys depends on
the model (a "long" request here is 6k tokens in, 800 out — a scene plus
the codex entries it names):

| `DEFAULT_MODEL` | Long requests a month | Short ones (1k in, 200 out) |
|---|---|---|
| `claude-opus-5` (current default) | ~120 | ~600 |
| `claude-sonnet-5` | ~300 | ~1,500 |
| `claude-haiku-4-5` | ~600 | ~3,000 |

Set it as a function secret; no redeploy of the app. On Opus 5 a
safety-classifier refusal is automatically re-run on the model Anthropic
recommends for that case (`fallbacks: "default"`), so a writer isn't
left with nothing; the meter charges the model that actually answered.

### What a subscriber costs to serve

Paddle takes about 5% + 50¢ per charge (it is the merchant of record:
it collects and files sales tax and VAT in every country, which a
one-person company otherwise can't). So:

- **Plus** at $8: about $7.10 left before hosting.
- **Pro** at $18: about $16.60 left, minus up to $6 of AI.
- **Hosting**: Supabase's free plan pauses a project after a week with
  no activity and caps the database at 500 MB, so it is fine for
  testing and wrong for a launch. Pro is $25/month with 8 GB of database
  and 100 GB of storage. Four Plus subscribers cover it.

## NEEDS OWNER — to switch the cloud on

Nothing below can be done from a coding session: each needs the owner's
account, card or identity. In order:

1. **Push the local work** (see "Moving development to the cloud" below).
   Until then the app code in the cloud is weeks behind the owner's PC.
2. **Create a Supabase project** (free to start) at supabase.com.
   Region near most writers. Save the database password somewhere safe.
3. **Run the migration**: `npx supabase link --project-ref <ref>` then
   `npx supabase db push`, or paste the migration file into the SQL editor.
4. **Email that actually sends**: Supabase's built-in mailer sends two
   emails an hour and only to the project's own team, so sign-in links
   would never reach a real writer. Add a transactional email provider
   (Resend, Postmark, SendGrid…) under Authentication → Emails → SMTP.
   This needs a domain you control.
5. **Google sign-in**: in Google Cloud Console, create an OAuth client
   (Web application), add Supabase's callback URL, and paste the client
   id and secret into Authentication → Providers → Google. The consent
   screen needs an app name, support email and privacy-policy link.
6. **App values**: copy the project URL and publishable (anon) key into
   `.env.local` for local builds and into the repo's Actions secrets for
   CI builds. These two are public by design.
7. **Anthropic key for Pro**: create a key at platform.claude.com under
   an organisation with a monthly spending limit set, then
   `npx supabase secrets set ANTHROPIC_API_KEY=… ALLOWED_ORIGINS=…` and
   `npx supabase functions deploy ai`.
8. **Paddle**: create a sandbox account first. Add products Plus and
   Pro, each with a monthly and a yearly price. Add a notification
   destination pointing at
   `https://<ref>.supabase.co/functions/v1/billing-webhook`, subscribed
   to the `subscription.*` events. Then
   `npx supabase secrets set PADDLE_WEBHOOK_SECRET=… PRICE_TIERS='{"pri_…":"plus",…}'`
   and `npx supabase functions deploy billing-webhook --no-verify-jwt`.
   **Send one test event from Paddle's simulator and confirm a row lands
   in `entitlements`** — the payload field names in `billingCore.ts`
   have not yet been checked against a live delivery.
9. **Deploy the account-deletion function**:
   `npx supabase functions deploy delete-account` (JWT verification on;
   uses the same `ALLOWED_ORIGINS` secret). Writers can then delete their
   account and every stored file from Settings, and download everything
   first as one zip.
10. **Before anyone outside the owner signs in**: a privacy policy and
   terms (Paddle and Google both require them), and README.md and
   SECURITY.md rewritten — both currently promise "no account, no cloud
   sync", which stops being true the day this switches on.
11. **Upgrade Supabase to Pro** ($25/mo) before launch, for the reason
    in "What a subscriber costs".

Also worth doing, free: turn on GitHub private vulnerability reporting
(already on the old list), and decide whether the repository itself
should be private while the app is. It is public today, as are the
v0.3.0 installers and the GitHub Pages build. Pages on a private
repository needs a paid GitHub plan.

## What comes next in code, in order

These touch files the owner's unpushed work also changed (App.tsx,
Settings, the vault store, the pane and draft keys), so they wait for
that push rather than risk a merge that loses either side's work.

1. **Sign-in and account screen.** Settings → Account: sign in with
   Google or an email link, plan and meter, storage used, sign out.
   Desktop sign-in opens the system browser (Google refuses sign-in
   inside embedded webviews) and returns through a `novella://` link —
   needs the Tauri deep-link plugin.
2. **Wire the engine into storage.** `storage()` hands back a wrapper
   that tells the engine about every write and delete; the engine gets
   the raw adapter. After each pull, reload changed notes and route an
   unsaved one through the existing conflict flow. A status line in the
   same voice as autosave: "Synced", "3 changes waiting — offline".
3. **"Sync this book" / "Open a book from the cloud"** on the projects
   screen, with the one-book Free limit explained before it bites.
4. **Settings that follow the writer.** Classify every localStorage key
   as account / book / this-device, move book-level state into the book
   folder so the file sync carries it, and sync account-level keys
   through `user_settings`. A guard test that fails on any key nobody
   classified.
5. **Novella AI as a connection** in Settings → Connections, available
   to Pro, with the meter; the existing role fallback takes over when
   the allowance is spent.
6. **Upgrade flow**: Paddle checkout opened with the writer's user id in
   `customData`, and a "Manage subscription" link to Paddle's portal.

Known limitations, kept on purpose for v1: history and trash index
files resolve conflicts by newest-device-wins rather than merging; blobs
replaced by newer versions are not yet garbage-collected; two files
whose paths differ only by letter case collide on Windows and macOS;
changes arrive by polling (on open, on focus, every minute), not by
realtime push.

## Moving development to the cloud

As of 2026-09-23 the newest Novella work — the quality board at commit
`be2a174`, 43 test suites, inline comments, find and replace, the
Settings dialog and the rest of Phase 1 — exists only on the owner's
Windows PC. GitHub's `main` stops at 22 suites. A cloud session, the
daily autopilot routine, or a second computer all start from GitHub, so
until that work is pushed, every one of them works on the old app.

From `C:\Users\drewp\Novella.ai` in PowerShell:

```
git status
git add -A
git commit -m "Local work through the Sept 17 quality board"
git push origin HEAD:refs/heads/owner/local-work
```

Pushing to a new branch rather than `main` means it can't be rejected
for being behind, and it doesn't trigger the Pages deploy, so nothing
becomes public. A cloud session then merges it with this work. Put the
handoff notes in the folder before committing and they travel too.
