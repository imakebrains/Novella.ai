import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "../storage";
import { desktopLog } from "../debug";
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_GB,
  listOllamaModels,
  ollamaReachable,
  pullOllamaModel,
  type PullProgress,
} from "../plugins/providers/ollama";

/* First-run setup for the local AI engine.

   The one-install rule: the writer installed Novella and should not have
   to go and find anything else. Everything here happens inside the app —
   installing the engine, starting it, downloading the model — with sizes
   stated up front so nobody is surprised by a five gigabyte download.

   Nothing starts on its own. Each step is a button, because a multi-GB
   download on someone's metered connection is not a decision to make for
   them. */

type Step = "checking" | "no-engine" | "engine-stopped" | "no-model" | "ready";

interface Props {
  /** Rendered inline in Settings, or as a first-run prompt. */
  compact?: boolean;
}

export function SetupPanel({ compact }: Props) {
  const [step, setStep] = useState<Step>("checking");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    setStep("checking");
    setError(null);

    // In a plain browser there's no way to install anything; we can only
    // report what we find and say so honestly.
    if (isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const installed = await invoke<boolean>("ollama_installed");
        const winget = await invoke<boolean>("winget_available");
        setCanInstall(winget);
        desktopLog(`setup: engine installed=${installed} winget=${winget}`);
        if (!installed) {
          setStep("no-engine");
          return;
        }
      } catch (err) {
        // Falling through means we degrade to "can we reach the API",
        // which still works — but log it, because a failing invoke means
        // the install button will be missing when a user needs it.
        desktopLog(`setup: probe failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!(await ollamaReachable())) {
      setStep(isTauri() ? "engine-stopped" : "no-engine");
      return;
    }

    const models = await listOllamaModels();
    setStep(models.length === 0 ? "no-model" : "ready");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => () => abort.current?.abort(), []);

  const installEngine = async () => {
    setBusy("Installing the AI engine…");
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("install_ollama");
      await invoke("start_ollama").catch(() => {
        /* may already be running */
      });
      // The service takes a moment to bind its port after installing.
      await new Promise((r) => setTimeout(r, 2500));
      await check();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const startEngine = async () => {
    setBusy("Starting the AI engine…");
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("start_ollama");
      await new Promise((r) => setTimeout(r, 2000));
      await check();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const downloadModel = async () => {
    setBusy("Downloading the writing model…");
    setError(null);
    setProgress(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      await pullOllamaModel(DEFAULT_MODEL, setProgress, controller.signal);
      await check();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(null);
      setProgress(null);
      abort.current = null;
    }
  };

  if (step === "ready" && compact) {
    return <p className="hint ok">Local AI ready — nothing else to install.</p>;
  }

  return (
    <div className={`setup ${compact ? "compact" : ""}`}>
      <ol className="setup-steps">
        <SetupStep
          done={step === "engine-stopped" || step === "no-model" || step === "ready"}
          label="AI engine"
          detail={
            step === "no-engine"
              ? isTauri()
                ? canInstall
                  ? "Not installed yet. Novella can install it for you."
                  : "Not installed, and winget isn't available to install it automatically."
                : "Not running. The browser version can't install it — use the desktop app."
              : "Installed"
          }
          action={
            step === "no-engine" && isTauri() && canInstall
              ? { label: "Install", onClick: installEngine }
              : step === "engine-stopped"
                ? { label: "Start", onClick: startEngine }
                : undefined
          }
          busy={busy !== null}
        />

        <SetupStep
          done={step === "ready"}
          label="Writing model"
          detail={
            step === "ready"
              ? "Downloaded and ready"
              : `${DEFAULT_MODEL} · about ${DEFAULT_MODEL_GB} GB, downloaded once and then it works offline forever`
          }
          action={
            step === "no-model" ? { label: "Download", onClick: downloadModel } : undefined
          }
          busy={busy !== null}
        />
      </ol>

      {busy && (
        <div className="setup-busy">
          <span>{busy}</span>
          {progress && (
            <>
              <div className="meter">
                <div
                  className="meter-fill warn"
                  style={{ width: `${(progress.fraction ?? 0) * 100}%` }}
                />
              </div>
              <span className="meter-caption">
                {progress.status}
                {progress.totalBytes > 0 && (
                  <>
                    {" · "}
                    {(progress.receivedBytes / 1e9).toFixed(2)} of{" "}
                    {(progress.totalBytes / 1e9).toFixed(2)} GB
                  </>
                )}
              </span>
              <button className="btn-ghost" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="notice error-notice">
          {error}
          {step === "no-engine" && (
            <p>
              You can also install it yourself from <code>ollama.com</code> — Novella will
              detect it automatically once it's there.
            </p>
          )}
        </div>
      )}

      {!busy && step !== "checking" && (
        <button className="btn-ghost setup-recheck" onClick={() => void check()}>
          Check again
        </button>
      )}
    </div>
  );
}

function SetupStep({
  done,
  label,
  detail,
  action,
  busy,
}: {
  done: boolean;
  label: string;
  detail: string;
  action?: { label: string; onClick: () => void | Promise<void> };
  busy: boolean;
}) {
  return (
    <li className={`setup-step ${done ? "done" : ""}`}>
      <span className="setup-check" aria-hidden>
        {done ? "✓" : "○"}
      </span>
      <div className="setup-text">
        <div className="setup-label">{label}</div>
        <div className="setup-detail">{detail}</div>
      </div>
      {action && (
        <button className="btn-primary setup-action" onClick={() => void action.onClick()} disabled={busy}>
          {action.label}
        </button>
      )}
    </li>
  );
}
