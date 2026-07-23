import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { pluginHost, usePluginVersion } from "../plugins/runtime";
import { listOllamaModels, type OllamaModel } from "../plugins/providers/ollama";
import { buildSceneContext, estimateTokens } from "../ai/context";
import { buildFromTemplate, usedVariables } from "../ai/prompts";
import { generate } from "../ai/generate";
import { insertIntoEditor } from "./editorBridge";
import { CritiquePanel } from "./CritiquePanel";
import { ContinuityPanel } from "./ContinuityPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TasksPanel } from "./TasksPanel";
import { SetupPanel } from "./SetupPanel";
import { CalendarTab } from "./CalendarTab";
import { GoalsTab } from "./GoalsTab";
import { MusicTab } from "./MusicTab";
import { tabPrefs, useTabPrefs, type TabId } from "./inspectorTabs";

/* The inspector: the writer's toolbelt, arranged by the writer.

   Every tab can be dragged to reorder or closed outright (the + menu
   brings closed ones back). Someone who never uses Critique shouldn't
   look at it every day; someone who lives in Tasks can put it first.

   Needing the active note is per-tab: Calendar, Goals, Tasks and Music
   are project-wide and work with nothing open. */

const TAB_DEFS: Record<TabId, { label: string; title: string; needsNote: boolean }> = {
  links: { label: "Links", title: "Backlinks and references for this note", needsNote: true },
  critique: { label: "Critique", title: "Prose analysis of this note", needsNote: true },
  tasks: { label: "Tasks", title: "Every to-do across the project", needsNote: false },
  history: { label: "History", title: "Earlier versions of this note", needsNote: true },
  assistant: { label: "Assistant", title: "Draft with your connected AI", needsNote: true },
  continuity: {
    label: "Continuity",
    title: "Provable slips: early mentions, duplicate names, dangling links",
    needsNote: false,
  },
  goals: { label: "Goals", title: "Daily goal, streak and the month's writing", needsNote: false },
  calendar: { label: "Calendar", title: "A real calendar with your plans on it", needsNote: false },
  music: { label: "Music", title: "This project's writing music", needsNote: false },
};

export function InspectorPane({ onShowMusicPlayer }: { onShowMusicPlayer: () => void }) {
  useVaultVersion();
  const prefs = useTabPrefs();
  const [plusOpen, setPlusOpen] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const active = store.active();
  const tab = prefs.active;

  // Click-away and Escape close the tool menu.
  useEffect(() => {
    if (!plusOpen) return;
    const away = (e: MouseEvent) => {
      if (!headRef.current?.contains(e.target as Node)) setPlusOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusOpen(false);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [plusOpen]);

  const renderTab = (id: TabId) => {
    if (TAB_DEFS[id].needsNote && !active) return <p className="empty-note">Nothing open.</p>;
    switch (id) {
      case "links":
        return <LinksTab />;
      case "critique":
        return <CritiquePanel />;
      case "tasks":
        return <TasksPanel />;
      case "history":
        return <HistoryPanel />;
      case "assistant":
        return <AssistantTab />;
      case "continuity":
        return <ContinuityPanel />;
      case "goals":
        return <GoalsTab />;
      case "calendar":
        return <CalendarTab />;
      case "music":
        return <MusicTab onShowPlayer={onShowMusicPlayer} />;
    }
  };

  // One dropdown instead of a wrapping tab strip — owner feedback: the
  // row of tabs read as clutter. The dropdown names where you are and
  // lists everywhere you could be, with a one-line description each.
  return (
    <aside className="pane pane-right">
      <div className="pane-head inspector-head" ref={headRef}>
        <button
          className="tool-picker-btn"
          onClick={() => setPlusOpen((v) => !v)}
          aria-expanded={plusOpen}
          title="Switch tool — links, tasks, history, assistant and more"
        >
          {TAB_DEFS[tab].label} <span className="picker-caret">▾</span>
        </button>

        {plusOpen && (
          <div className="tool-picker-menu" role="menu">
            {prefs.order.map((id) => (
              <button
                key={id}
                role="menuitem"
                className={`picker-item ${tab === id ? "on" : ""}`}
                onClick={() => {
                  tabPrefs.show(id);
                  tabPrefs.setActive(id);
                  setPlusOpen(false);
                }}
              >
                <span className="tool-name">{TAB_DEFS[id].label}</span>
                <span className="tool-blurb">{TAB_DEFS[id].title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pane-scroll">{renderTab(tab)}</div>
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

/* The old task-prompts (grammar check, storyboard, blurb…) crowded the
   style menu — owner feedback. Their notes stay in the vault for anyone
   who used them; the menu shows only styles: the default, the three
   samples, and anything the writer creates or uploads. */
const LEGACY_PROMPTS = new Set([
  "Expand beat",
  "Continue scene",
  "Rewrite selection",
  "Describe setting",
  "Dialogue pass",
  "Storyboard this chapter",
  "Grammar check",
  "Familiarity check",
  "Blurb writer",
]);

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

  // A chosen style replaces the default "continue" behaviour. Both
  // builders return the same shape, so nothing downstream branches. The
  // writer's direction line rides along either way — styles that use
  // {{guidance}} place it themselves; for the rest it's appended.
  const chosen = promptId ? store.vault.get(promptId) : undefined;
  const baseCtx = chosen
    ? buildFromTemplate(chosen.body, active, referenced, { guidance: instruction })
    : buildSceneContext(active, referenced, { instruction });
  const ctx =
    chosen && instruction.trim() && !chosen.body.includes("{{guidance}}")
      ? { ...baseCtx, prompt: `${baseCtx.prompt}\n\nDirection from the writer: ${instruction.trim()}` }
      : baseCtx;

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
          Only the codex entries this scene references get sent — never the whole thing.
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

      <Section title="Writing style">
        <select
          className="select"
          value={promptId}
          onChange={(e) => {
            setPromptId(e.target.value);
            setOutput("");
          }}
          disabled={busy}
          aria-label="Writing style"
        >
          <option value="">Continue the scene (default)</option>
          {store
            .prompts()
            .filter((p) => !LEGACY_PROMPTS.has(p.title))
            .map((p) => (
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
          A style is how the assistant writes — try <em>Extensive novel</em>,{" "}
          <em>Paragraph mode</em> or <em>Email writer</em>. Each one is an ordinary
          note under Prompts in the left pane, editable like any other file.
        </p>
        <div className="btn-row">
          <button
            className="btn-ghost"
            disabled={busy}
            title="Creates an editable style note and opens it — write instructions for how the assistant should sound"
            onClick={() => {
              let n = store.prompts().length + 1;
              while (store.vault.resolveLink(`My style ${n}`)) n++;
              const note = store.createNote("prompt", `My style ${n}`);
              store.setBody(
                note.id,
                `Continue "{{scene}}" in this style:\n\n(Describe the voice you want here — sentence length, mood, how much detail, what to avoid.)\n\n{{prose}}\n\nDirection from the writer:\n{{guidance}}\n\nWrite only the prose.`,
              );
            }}
          >
            + New style
          </button>
          <label className="btn-ghost upload-style" title="Import a .txt or .md file as a style">
            Upload style…
            <input
              type="file"
              accept=".txt,.md"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const name = file.name.replace(/\.(txt|md)$/i, "").replace(/[-_]/g, " ");
                  let title = name;
                  let n = 2;
                  while (store.vault.resolveLink(title)) title = `${name} ${n++}`;
                  const note = store.createNote("prompt", title);
                  store.setBody(note.id, text);
                  setPromptId(note.id);
                });
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Section>

      <Section title="Generate">
        <input
          className="search inline"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="What should this be about? e.g. “the storm hits mid-conversation”"
          title="One line of direction for this run — what should happen, what it's about. Works with every style."
          disabled={busy}
        />
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
