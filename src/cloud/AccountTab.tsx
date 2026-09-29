import { useEffect, useState } from "react";
import { PLANS, aiShareUsed, formatBytes, type AccountSummary } from "./plans";
import { myAccount } from "./supabaseRemote";
import { describeCloudError } from "./wire";
import {
  appClient,
  googleAvailable,
  hostedAccess,
  signInWithEmailCode,
  signInWithGoogle,
  signOut,
  useCloudSession,
  verifyEmailCode,
} from "./auth";
import { CloudBooksSection } from "./CloudBooksSection";
import {
  initialOf,
  looksLikeEmail,
  normalizeCode,
  normalizeEmail,
  planChoices,
  readFunctionReply,
  shareOf,
  type CloudUser,
} from "./authCore";
import { callFunction } from "./functions";
import { manageSubscriptionUrl, openExternal, startCheckout } from "./checkout";
import { downloadEverything } from "./downloadEverything";
import type { Period } from "../../supabase/functions/_shared/checkoutCore";

/* Settings → Account.

   Three components, not one with branches: the signed-in view owns the
   effects and state for the plan, the download and the deletion, and
   keeping those in their own component is what lets the session flip
   from signed out to signed in without React seeing a different number
   of hooks. The one piece of state that has to outlive the signed-in
   view — the server's sentence after a deletion — lives up here. */

export function AccountTab() {
  const session = useCloudSession();
  const [farewell, setFarewell] = useState<string | null>(null);

  if (session.status === "off") return <CloudOff />;
  if (session.status === "signed-out") return <SignInForm farewell={farewell} />;
  return <SignedInAccount user={session.user} onDeleted={setFarewell} />;
}

function CloudOff() {
  return (
    <section className="ap-section">
      <h3 className="ap-title">Account</h3>
      <p className="ap-sub">
        This build has no cloud configured, so there is nothing to sign in to. Everything you
        write stays on this computer.
      </p>
    </section>
  );
}

/* ---------------- signed out ---------------- */

function SignInForm({ farewell }: { farewell: string | null }) {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (err) {
      // auth.ts throws only friendlyAuthError's sentences.
      setError(err instanceof Error ? err.message : "Sign-in didn't work. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (!looksLikeEmail(email)) throw new Error("That doesn't look like an email address. Check it and try again.");
      await signInWithEmailCode(email);
      setCode("");
      setStage("code");
    });

  const verify = () => run(() => verifyEmailCode(email, code));

  return (
    <section className="ap-section">
      <h3 className="ap-title">Sign in</h3>
      {farewell && <p className="hint probe-ok">{farewell}</p>}
      <p className="ap-sub">
        An account is optional. It syncs the books you choose between your computers and holds
        your plan. Everything else in Novella works without one.
      </p>

      {stage === "email" ? (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <div className="setting">
            <label className="setting-label" htmlFor="account-email">
              Email
            </label>
            <input
              id="account-email"
              className="field-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button className="btn-primary" type="submit" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="hint">
            We emailed a code to {normalizeEmail(email)}. It works once, and only for a
            little while — if it has expired, send another.
          </p>
          <div className="setting">
            <label className="setting-label" htmlFor="account-code">
              Code
            </label>
            <input
              id="account-code"
              className="field-input account-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123 456"
            />
          </div>
          <div className="account-actions">
            <button className="btn-primary" type="submit" disabled={busy || normalizeCode(code).length < 6}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button className="btn-ghost" type="button" disabled={busy} onClick={() => void sendCode()}>
              Send another code
            </button>
            <button
              className="btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                setStage("email");
                setError(null);
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      {error && <p className="hint probe-bad">{error}</p>}

      {googleAvailable() ? (
        <div className="account-actions">
          <button className="btn-ghost" disabled={busy} onClick={() => void run(signInWithGoogle)}>
            Continue with Google
          </button>
        </div>
      ) : (
        <p className="hint">
          On the desktop app, sign in with an emailed code; Google sign-in works in the browser
          version.
        </p>
      )}
    </section>
  );
}

/* ---------------- signed in ---------------- */

function accountLoadError(err: unknown): string {
  const problem = describeCloudError(err);
  if (problem.kind === "offline") return "Offline — your plan and storage will show when you reconnect.";
  if (problem.kind === "signed-out") return problem.message;
  return "Couldn't load your plan just now. Nothing on this device is affected.";
}

function downloadError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  // archive.ts's own sentence, written for the writer.
  if (/didn't download intact/.test(message)) return message;
  const problem = describeCloudError(err);
  if (problem.kind === "offline") return "Couldn't reach the cloud. Nothing was saved; try again when you're online.";
  if (problem.kind === "signed-out") return problem.message;
  return "The download stopped partway. Nothing was saved; try again.";
}

function Meter({ share, caption }: { share: number; caption: string }) {
  const pct = Math.round(share * 100);
  return (
    <div className="meter-wrap">
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={caption}>
        <div className={`meter-fill ${share > 0.9 ? "warn" : "good"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="meter-caption">{caption}</span>
    </div>
  );
}

/** The link a checkout or the portal opened, shown every time: on the
    desktop nothing may have opened at all (see checkout.ts). */
function LinkHandoff({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="account-handoff">
      <p className="hint">If nothing opened, use this link:</p>
      <a className="btn-ghost" href={url} target="_blank" rel="noreferrer">
        {label} ↗
      </a>
      <button
        className="btn-ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function SignedInAccount({ user, onDeleted }: { user: CloudUser; onDeleted: (message: string) => void }) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>("monthly");
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ url: string; label: string } | null>(null);

  const [progress, setProgress] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadResult, setDownloadResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const client = await appClient();
        const summary = client ? await myAccount(client) : null;
        if (!live) return;
        setAccount(summary);
        if (!summary) setLoadError("Your plan couldn't be read. Try again in a moment.");
      } catch (err) {
        if (live) setLoadError(accountLoadError(err));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [user.id]);

  const toPaddle = async (label: string, getUrl: () => Promise<string>) => {
    setPlanBusy(true);
    setPlanError(null);
    setHandoff(null);
    try {
      const url = await getUrl();
      openExternal(url);
      setHandoff({ url, label });
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "That didn't work. Try again in a minute.");
    } finally {
      setPlanBusy(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    setDownloadResult(null);
    try {
      const client = await appClient();
      if (!client) throw new Error("no client");
      const saved = await downloadEverything(client, user, setProgress);
      setDownloadResult(saved ? { ok: true, text: `Saved to ${saved}` } : null);
    } catch (err) {
      setDownloadResult({ ok: false, text: downloadError(err) });
    } finally {
      setProgress(null);
      setDownloading(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const access = await hostedAccess();
      if (!access) throw new Error("Sign in again to delete your account.");
      const res = await callFunction(access, "delete-account", { confirm: typed });
      const reply = readFunctionReply(res.status, res.body, "The account couldn't be deleted. Nothing was deleted; try again.");
      if (!reply.ok) {
        setDeleteError(reply.message);
        return;
      }
      const message = typeof reply.body.message === "string" ? reply.body.message : "Your account has been deleted.";
      // The message is kept above this view, which unmounts once the
      // session goes. signOut is safe with the user row already gone.
      onDeleted(message);
      await signOut();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "The account couldn't be deleted. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const plan = account ? PLANS[account.tier] : null;
  const choices = account ? planChoices(account) : [];
  const aiShare = account ? aiShareUsed(account) : null;
  const confirmed = normalizeEmail(typed) === normalizeEmail(user.email);

  return (
    <>
      <section className="ap-section">
        <h3 className="ap-title">You</h3>
        <div className="account-identity">
          <span className="account-avatar" aria-hidden="true">
            {initialOf(user)}
          </span>
          <div className="account-who">
            {user.name && <span className="account-name">{user.name}</span>}
            <span className="account-email">{user.email}</span>
          </div>
        </div>
        <div className="account-actions">
          <button
            className="btn-ghost"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut().finally(() => setSigningOut(false));
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>

      <section className="ap-section">
        <h3 className="ap-title">Your plan</h3>
        {loading && <p className="hint">Loading your plan…</p>}
        {loadError && <p className="hint probe-bad">{loadError}</p>}
        {account && plan && (
          <>
            <p className="account-plan-name">{plan.name}</p>
            <p className="account-plan-tagline">{plan.tagline}</p>
            <div className="account-meters">
              <Meter
                share={shareOf(account.bytesUsed, account.maxBytes)}
                caption={`${formatBytes(account.bytesUsed)} of ${formatBytes(account.maxBytes)} stored`}
              />
              <p className="hint">
                {account.projects} of {account.maxProjects ?? "unlimited"} book{account.maxProjects === 1 ? "" : "s"} synced
              </p>
              {aiShare !== null && <Meter share={aiShare} caption={`Novella AI this month — ${Math.round(aiShare * 100)}% used`} />}
            </div>

            <div className="account-actions">
              {choices.includes("upgrade-plus") && (
                <>
                  <button
                    className="btn-primary"
                    disabled={planBusy}
                    onClick={() => void toPaddle("Open checkout", () => startCheckout("plus", period))}
                  >
                    Upgrade to Plus
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={planBusy}
                    onClick={() => void toPaddle("Open checkout", () => startCheckout("pro", period))}
                  >
                    Upgrade to Pro
                  </button>
                  <select
                    className="select bare"
                    aria-label="Billing period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as Period)}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </>
              )}
              {choices.includes("manage") && (
                <button
                  className="btn-ghost"
                  disabled={planBusy}
                  onClick={() => void toPaddle("Open subscription", manageSubscriptionUrl)}
                >
                  Manage subscription
                </button>
              )}
            </div>
            {choices.includes("manage") && (
              <p className="hint">
                To change plan, use Manage subscription — it adjusts the one you have, so you're
                never charged twice.
              </p>
            )}
            {planBusy && <p className="hint">Opening Paddle…</p>}
            {planError && <p className="hint probe-bad">{planError}</p>}
            {handoff && <LinkHandoff url={handoff.url} label={handoff.label} />}
          </>
        )}
      </section>

      <CloudBooksSection />

      <section className="ap-section">
        <h3 className="ap-title">Take everything with you</h3>
        <p className="ap-sub">
          One zip of every book in your cloud account, each in its own folder exactly as Novella
          keeps it, plus your synced settings. Built on this computer from your own files.
        </p>
        <div className="account-actions">
          <button className="btn-ghost" disabled={downloading} onClick={() => void download()}>
            {downloading ? "Downloading…" : "Download everything"}
          </button>
        </div>
        {progress && <p className="hint">{progress}</p>}
        {downloadResult && (
          <p className={`hint ${downloadResult.ok ? "probe-ok" : "probe-bad"}`}>{downloadResult.text}</p>
        )}
      </section>

      <section className="ap-section account-danger">
        <h3 className="ap-title">Delete account</h3>
        <p className="ap-sub">
          Deletes the cloud copy of your books and the account itself. The folders on your
          computers are untouched. Download everything first if you want a copy.
        </p>
        <div className="setting">
          <label className="setting-label" htmlFor="account-delete-confirm">
            Type {user.email} to confirm
          </label>
          <input
            id="account-delete-confirm"
            className="field-input"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your email to confirm"
          />
        </div>
        <div className="account-actions">
          <button className="btn-ghost danger" disabled={!confirmed || deleting} onClick={() => void deleteAccount()}>
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </div>
        {deleteError && <p className="hint probe-bad">{deleteError}</p>}
      </section>
    </>
  );
}
