# Novella Privacy Policy — DRAFT

> **Draft for the owner and a lawyer to review. Not legal advice and not
> yet in force.** Written 2026-09-23 from what the code actually does
> (docs/CLOUD.md, supabase/migrations). Everything in [brackets] needs
> the owner. Re-check every claim against the shipped app before
> publishing: a privacy policy that describes a feature which works
> differently is worse than none.
> "Settings → Account" names the screen planned as Phase 2 item 10;
> it does not exist yet, so neither document can be published before it does.

Last updated: [date of publication]

Novella is a writing app made by [legal name] ("we"). This policy
explains what Novella collects, why, where it goes, and how to take it
back. The short version: your writing is yours, it is visible only to
your own account, we never sell it or use it to train AI models, and
you can download or delete all of it at any time.

## If you don't create an account

Novella works without an account. Your books then live only in a folder
on your computer (desktop app) or in your browser's own storage (web
app). Nothing about your writing is sent to us. The app makes two kinds
of network request on its own: a check for a newer version on GitHub,
and, only if you subscribe to one, a calendar feed you added. Neither
carries anything about your books.

## If you create an account

**What we collect**

| What | Why | Where it's kept |
|---|---|---|
| Your email address, and your name and profile picture if you sign in with Google | To sign you in and to contact you about your account | Our hosting provider (Supabase) |
| Your books: chapters, notes, codex entries, covers and the other files in each synced book | To keep them in sync across your devices | Supabase, visible only to your account |
| Settings you choose to sync (theme, fonts, layout) | So your setup follows you between devices | Supabase, visible only to your account |
| Your plan, subscription status and billing period | To know which features your plan includes | Supabase |
| For Pro's built-in AI: how much of your monthly allowance you've used (cost and token counts, not the text) | To show you the meter and enforce the allowance | Supabase |

**What we don't collect:** we run no analytics or advertising trackers,
and we don't sell or rent personal information. [If crash reporting or
analytics is ever added, this section must change before it ships.]

**API keys** you add for your own AI connections (Claude, OpenAI and
others) are never sent to us. They stay in your operating system's
credential store on each device.

## Who else processes your data

We use a small number of providers to run the service. Each receives
only what it needs:

- **Supabase** hosts the database, sign-in and file storage. [Region:
  e.g. EU (Frankfurt) or US East.] Data is encrypted in transit and at
  rest by the provider.
- **Google**, only if you choose "Sign in with Google": Google tells us
  your email, name and profile picture. We never get access to your
  Google Drive, Gmail or anything else.
- **[Email provider, e.g. Resend]** sends sign-in links and account
  emails to your address.
- **Paddle** is the merchant of record for subscriptions: you buy from
  Paddle, which handles payment, tax and invoices. We never see your
  card details. Paddle's own privacy notice covers what it collects.
- **Anthropic**, only when you use Pro's built-in AI: the text of that
  request (the passage and the codex entries it names) is sent to
  Anthropic's API to generate the answer. [Confirm and cite Anthropic's
  current commercial terms on data use and retention before
  publishing.] When you use your own AI connection instead, the request
  goes straight from your device to the provider you chose; we are not
  involved.

## Who can see your writing

Only you. Every row in our database carries its owner, and the database
itself refuses to return one person's data to another account. This is
enforced by the database rather than by the app, and it is tested. We
don't read your writing. [State the narrow circumstances in which the
owner could access stored data at the infrastructure level, e.g. to
comply with a legal order, and what process governs it.]

We never use your writing to train AI models, and we don't let anyone
else do so.

## Keeping and deleting

- **Download everything:** Settings → Account → Download everything
  gives you every book as a folder of plain files, plus your synced
  settings, in one zip.
- **Delete your account:** Settings → Account → Delete account removes
  your stored files and then your account and every record tied to it.
  If you have an active subscription you'll be asked to cancel it first,
  so you are never charged for an account that no longer exists.
- Deleted data may remain in our hosting provider's backups for up to
  [N] days before those backups expire. It is not restored from them
  except to recover from a failure of the service itself.
- Deleting your account doesn't touch the copies of your books on your
  own devices.

## Your rights

Depending on where you live (for example under the GDPR in the EU and
UK, or the CCPA in California) you may have the right to access,
correct, download, delete or restrict the processing of your personal
information, and to object to it. Most of these you can do yourself in
Settings → Account. For anything else, contact [privacy email]. We'll
answer within [30] days. You can also complain to your local data
protection authority.

[Legal basis for EU/UK users: performance of a contract (providing the
service you signed up for) for account and sync data; legitimate
interests for security and abuse prevention. Confirm with counsel.]

## Children

Novella isn't intended for children under [13, or 16 in the EU]. We
don't knowingly collect their information; if you believe a child has
created an account, contact [privacy email] and we'll delete it.

## Changes

If we change this policy in a way that affects how your information is
used, we'll tell you by email or in the app before the change takes
effect.

## Contact

[Legal name, postal address]
[privacy email]
