import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { pluginHost, usePluginVersion } from "../plugins/runtime";
import { listOllamaModels, type OllamaModel } from "../plugins/providers/ollama";
import { buildSceneContext, estimateTokens } from "../ai/context";
import { buildFromTemplate, usedVariables } from "../ai/prompts";
import { generate } from "../ai/generate";
import { insertIntoEditor } from "./editorBridge";
import { CritiquePanel } from "./CritiquePanel";
import { HistoryPanel } from "./HistoryPanel";
import { TasksPanel } from "./TasksPanel";
import { SetupPanel } from "./SetupPanel";

type Tab = "links" | "critique" | "tasks" | "history" | "assistant";

export function InspectorPane() {
  useVaultVersion();
  const [tab, setTab] = useState<Tab>("links");
  const active = store.active();

  return (
    <aside className="pane pane-right">
      <div className="pane-head tabs">
        <button className={`tab ${tab === "links" ? "on" : ""}`} onClick={() => setTab("links")}>
          Links
        </button>
        <button
          className={`tab ${tab === "critique" ? "on" : ""}`}
          onClick={() => setTab("critique")}
        >
          Critique
        </button>
        <button
          className={`tab ${tab === "tasks" ? "on" : ""}`}
          onClick={() => setTab("tasks")}
          title="Every to-do across the project"
        >
          Tasks
        </button>
        <button
          className={`tab ${tab === "history" ? "on" : ""}`}
          onClick={() => setTab("history")}
          title="Earlier versions of this note"
        >
          History
        </button>
        <button
          className={`tab ${tab === "assistant" ? "on" : ""}`}
          onClick={() => setTab("assistant")}
        >
          Assistant
        </button>
      </div>

      <div className="pane-scroll">
        {!active ? (
          <p className="empty-note">Nothing open.</p>
        ) : tab === "links" ? (
          <LinksTab />
        ) : tab === "critique" ? (
          <CritiquePanel />
        ) : tab === "tasks" ? (
          <TasksPanel />
        ) : tab === "history" ? (
          <HistoryPanel />
        ) : (
          <AssistantTab />
        )}
      </div>
    </aside>
  );
}

/* ---------------- links ---------------- */

function LinksTab() {
  const active = store.active();
  if (!active) return null;

  const backlinks = store.vault.backlinksOf(active);
  const outgoing = store.outgoingLinks(active);
  const fields = Object.entries(active.data).filter(
    ([k]) => !["name", "title", "type", "id", "aliases", "tags"].includes(k),
  );

  return (
    <>
      <Section title="Backlinks" count={backlinks.length}>
        {backlinks.length === 0 ? (
          <p className="hint">Nothing references this yet.</p>
        ) : (
          backlinks.map(({ note, count }) => (
            <button key={note.id} className="link-row" onClick={() => store.open(note.id)}>
              <span className="type-dot" data-type={note.type} />
              <span className="link-name">{note.title}</span>
              {count > 1 && <span className="count">{count}</span>}
            </button>
          ))
        )}
      </Section>

      <Section title="References out" count={outgoing.length}>
        {outgoing.length === 0 ? (
          <p className="hint">This note links to nothing.</p>
        ) : (
          outgoing.map(({ name, note }) =>
            note ? (
              <button key={name} className="link-row" onClick={() => store.open(note.id)}>
                <span className="type-dot" data-type={note.type} />
                <span className="link-name">{note.title}</span>
              </button>
            ) : (
              <div key={name} className="link-row unresolved" title="Not yet written">
                <span className="type-dot" data-type="dangling" />
                <span className="link-name">{name}</span>
              </div>
            ),
          )
        )}
      </Section>

      {active.aliases.length > 0 && (
        <Section title="Also known as">
          <div className="chips">
            {active.aliases.map((a) => (
              <span key={a} className="chip">
                {a}
              </span>
            ))}
          </div>
        </Section>
      )}

      {active.tags.length > 0 && (
        <Section title="Tags">
          <div className="chips">
            {active.tags.map((t) => (
              <span key={t} className="chip tag">
                #{t}
              </span>
            ))}
          </div>
        </Section>
      )}

      {fields.length > 0 && (
        <Section title="Details">
          <dl className="fields">
            {fields.map(([k, v]) => (
              <div key={k} className="field">
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </>
  );
}

/* ---------------- assistant ---------------- */

type DaemonState = "checking" | "ready" | "no-models" | "unreachable";

function AssistantTab() {
  usePluginVersion();
  const active = store.active();

  const [instruction, setInstruction] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daemon, setDaemon] = useState<DaemonState>("checking");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [promptId, setPromptId] = useState<string>("");
  const abort = useRef<AbortController | null>(null);

  const settings = pluginHost.settingsFor("provider-ollama-streaming");
  const chosenModel = (settings.get("model") as string) || "";

  const refreshModels = useCallback(async () => {
    setDaemon("checking");
    try {
      const found = await listOllamaModels();
      setModels(found);
      setDaemon(found.length ? "ready" : "no-models");
      if (found.length && !chosenModel) {
        settings.set("model", found[0]!.name);
      }
    } catch {
      setDaemon("unreachable");
      setModels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenModel]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  useEffect(() => () => abort.current?.abort(), []);

  if (!active) return null;

  const referenced = store
    .outgoingLinks(active)
    .map((l) => l.note)
    .filter((n): n is NonNullable<typeof n> => Boolean(n));

  // A chosen prompt template replaces the default "continue" behaviour.
  // Both builders return the same shape, so nothing downstream branches.
  const chosen = promptId ? store.vault.get(promptId) : undefined;
  const ctx = chosen
    ? buildFromTemplate(chosen.body, active, referenced)
    : buildSceneContext(active, referenced, { instruction });

  const runGenerate = async () => {
    setBusy(true);
    setError(null);
    setOutput("");

    const controller = new AbortController();
    abort.current = controller;

    try {
      await generate(
        { system: ctx.system, prompt: ctx.prompt, maxTokens: 600 },
        (chunk) => setOutput((o) => o + chunk),
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const accept = () => {
    const text = output.trim();
    if (!text) return;
    // Spacing and position are the editor's business — it knows where the
    // cursor is and what's around it.
    if (!insertIntoEditor(text)) {
      setError("No chapter is open, so there is nowhere to insert.");
      return;
    }
    setOutput("");
  };

  return (
    <>
      <Section title="Model">
        <DaemonStatus state={daemon} models={models} />
        {models.length > 0 && (
          <select
            className="select"
            value={chosenModel}
            onChange={(e) => {
              settings.set("model", e.target.value);
              setOutput("");
            }}
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({(m.sizeBytes / 1e9).toFixed(1)} GB)
              </option>
            ))}
          </select>
        )}
      </Section>

      <Section title="Context for this scene">
        <p className="hint">
          Only the codex entries this scene references get sent — not the whole bible.
        </p>
        {ctx.referenced.length === 0 ? (
          <p className="hint">No codex entries referenced yet.</p>
        ) : (
          ctx.referenced.map((n) => (
            <button key={n.id} className="link-row" onClick={() => store.open(n.id)}>
              <span className="type-dot" data-type={n.type} />
              <span className="link-name">{n.title}</span>
              <span className="count">~{estimateTokens(n.body)}t</span>
            </button>
          ))
        )}
        <div className="token-bar">
          <span>Estimated context</span>
          <strong>~{ctx.estimatedTokens.toLocaleString()} tokens</strong>
        </div>
      </Section>

      <Section title="Prompt">
        <select
          className="select"
          value={promptId}
          onChange={(e) => {
            setPromptId(e.target.value);
            setOutput("");
          }}
          disabled={busy}
        >
          <option value="">Continue the scene (default)</option>
          {store.prompts().map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {chosen && (
          <p className="hint">
            {String(chosen.data.description ?? "")}
            {usedVariables(chosen.body).length > 0 && (
              <>
                {" "}
                Uses:{" "}
                {usedVariables(chosen.body).map((v) => (
                  <code key={v} className="var-token">
                    {v}
                  </code>
                ))}
              </>
            )}
          </p>
        )}
        <p className="hint">
          Prompts are ordinary notes in your vault — edit them like any other file.
        </p>
      </Section>

      <Section title="Generate">
        {!chosen && (
          <input
            className="search inline"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Continue this scene."
            disabled={busy}
          />
        )}
        <div className="btn-row">
          <button
            className="btn-primary"
            onClick={() => void runGenerate()}
            disabled={busy || daemon !== "ready"}
          >
            {busy ? "Writing…" : chosen ? `Run “${chosen.title}”` : "Continue the scene"}
          </button>
          {busy && (
            <button className="btn-ghost" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          )}
        </div>

        {error && <div className="notice error-notice">{error}</div>}

        {output && (
          <>
            <div className="generated">{output}</div>
            <div className="btn-row">
              <button
                className="btn-primary"
                onClick={accept}
                disabled={busy}
                title="Inserts at the cursor, or at the end of the chapter if the editor isn't focused"
              >
                Insert
              </button>
              <button className="btn-ghost" onClick={() => setOutput("")} disabled={busy}>
                Discard
              </button>
            </div>
          </>
        )}
      </Section>
    </>
  );
}

function DaemonStatus({ state, models }: { state: DaemonState; models: OllamaModel[] }) {
  if (state === "checking") return <p className="hint">Checking for Ollama…</p>;

  // Both failure states are fixable from inside the app — no terminal,
  // no visiting a download page.
  if (state === "unreachable" || state === "no-models") {
    return <SetupPanel compact />;
  }

  return (
    <p className="hint ok">
      Ollama ready · {models.length} model{models.length === 1 ? "" : "s"} installed
    </p>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="inspect-section">
      <h2 className="inspect-title">
        {title}
        {count !== undefined && count > 0 && <span className="count">{count}</span>}
      </h2>
      {children}
    </section>
  );
}
