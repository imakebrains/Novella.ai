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
import {
  cycleTab,
  hiddenTabs,
  tabPrefs,
  useTabPrefs,
  visibleTabs,
  type TabId,
  type TabPrefs,
} from "./inspectorTabs";

/* The inspector: the writer's toolbelt, arranged by the writer.

   Every tab can be dragged to reorder or closed outright (the + menu
   brings closed ones back). Someone who never uses Critique shouldn't
   look at it every day; someone who lives in Tasks can put it first.

   Two doors onto the same tools, on purpose. The Tools button names where
   you are and lists everywhere you could be — one click, no aim required,
   and a wheel over it flips through them. The strip beneath it is the
   arrangement made physical: what you keep, in your order, one click away.
   Both read the same prefs, so neither can drift from the other.

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
    if (TAB_DEFS[id].needsNote && !active)
      return (
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden>
            ¶
          </span>
          <p className="empty-line">Nothing open.</p>
        </div>
      );
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

  return (
    <aside className="pane pane-right">
      <div className="pane-head inspector-head" ref={headRef}>
        <button
          className="tool-picker-btn"
          onClick={() => setPlusOpen((v) => !v)}
          onWheel={(e) => {
            // Scroll over the button to flip through tools without opening
            // the menu — peek by wheel, commit by click. It walks the
            // visible tabs in the writer's own order, so a reordered strip
            // reorders the wheel with it.
            e.preventDefault();
            const dir = e.deltaY > 0 ? 1 : -1;
            tabPrefs.setActive(cycleTab(tab, tabPrefs.visible(), dir));
          }}
          aria-expanded={plusOpen}
          title="Switch tool — click for the menu, or scroll over this button to flip through"
        >
          {TAB_DEFS[tab].label} <span className="picker-caret">▾</span>
        </button>

        {plusOpen && (
          <div className="tool-picker-menu" role="menu">
            {visibleTabs(prefs).map((id) => (
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

      <TabStrip prefs={prefs} />

      <div
        className="pane-scroll"
        id={PANEL_ID}
        role="tabpanel"
        aria-label={`${TAB_DEFS[tab].label} — ${TAB_DEFS[tab].title}`}
      >
        {renderTab(tab)}
      </div>
    </aside>
  );
}

/* ---------------- the tab strip ---------------- */

/* Reorder by dragging, close with the ✕, bring closed ones back from the +.

   Dragging is pointer-based rather than HTML5 drag-and-drop — the same
   choice the corkboard made, for the same reason: a tab is itself
   interactive (click to open, ✕ to close), and browsers refuse to start a
   native drag from inside a button. Pointer events have no such rule, and
   they carry touch and pen without a second code path.

   Dragging is never the ONLY way to rearrange. It is unavailable to a
   keyboard, and unkind to anyone with a tremor or a small trackpad, so
   Alt+← / Alt+→ nudges the focused tab and the + menu spells the same
   moves out as ordinary buttons.

   The component stays thin on purpose: it turns pointers into an index and
   hands that to inspectorTabs, which owns every rule about what an
   arrangement may become. */

const PANEL_ID = "inspector-panel";
const DRAG_THRESHOLD_PX = 5;

function TabStrip({ prefs }: { prefs: TabPrefs }) {
  const visible = visibleTabs(prefs);
  const hidden = hiddenTabs(prefs);

  const stripRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [dragId, setDragId] = useState<TabId | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // How far the tab has travelled from where it was grabbed. It's
  // translated by this so it physically follows the finger; a tab that
  // stays pinned while you drag reads as broken.
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  // Mutable drag bookkeeping lives in a ref, not state: pointermove fires
  // far faster than React re-renders, and the first few moves of a drag
  // would be lost waiting for state to settle.
  const drag = useRef<{ tab: TabId; startX: number; startY: number; active: boolean } | null>(null);

  const endDrag = useCallback(() => {
    drag.current = null;
    setDragId(null);
    setOverIndex(null);
    setOffset(null);
  }, []);

  // A cancelled drag must leave nothing behind — no lifted tab, no stale
  // drop marker. Escape is the reflex people already have; pointercancel
  // and a lost capture (the browser taking the pointer for a scroll or a
  // system gesture) route to the same cleanup.
  useEffect(() => {
    if (!dragId) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDrag();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dragId, endDrag]);

  // Click-away and Escape close the + menu.
  useEffect(() => {
    if (!plusOpen) return;
    const away = (e: MouseEvent) => {
      if (!plusRef.current?.contains(e.target as Node)) setPlusOpen(false);
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

  /** Which visible slot sits under a point, hit-tested against what's
      actually on screen. The strip wraps onto a second row in a narrow
      pane, so arithmetic along one axis would put tabs in the wrong place;
      rectangles can't be wrong about it. The dragged tab is skipped — it
      travels with the cursor, so it would otherwise always be the answer. */
  const indexAt = (x: number, y: number, skip: TabId | null): number | null => {
    const strip = stripRef.current;
    if (!strip) return null;
    for (const el of strip.querySelectorAll<HTMLElement>("[data-tab-index]")) {
      if (skip && el.dataset.tabId === skip) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return Number(el.dataset.tabIndex);
      }
    }
    return null;
  };

  // Moving the tool with an arrow key should move the focus ring with it,
  // or the next keypress comes from somewhere the writer isn't looking.
  // A frame's wait, because the tab to focus doesn't exist until React has
  // rendered the new arrangement.
  const focusTab = (id: TabId) => {
    requestAnimationFrame(() =>
      stripRef.current?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus(),
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, tab: TabId) => {
    // The ✕ has its own job; a drag begun on it would fight the click.
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    if (e.button !== 0) return;
    // Capture keeps the drag alive when the cursor outruns the tab. It can
    // throw if the pointer is already released; a failed capture shouldn't
    // take dragging down with it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* drag still works, just without capture */
    }
    drag.current = { tab, startX: e.clientX, startY: e.clientY, active: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;

    if (!d.active) {
      // A click must not become a drag, or opening a tool by tapping it
      // would be impossible.
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      setDragId(d.tab);
    }

    setOffset({ x: e.clientX - d.startX, y: e.clientY - d.startY });
    const idx = indexAt(e.clientX, e.clientY, d.tab);
    if (idx !== null) setOverIndex(idx);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>, tab: TabId) => {
    // Read the drag before releasing capture: the release fires
    // lostpointercapture, whose handler clears this very ref.
    const d = drag.current;
    drag.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }

    // Nothing on record means the press began somewhere that opted out
    // (the ✕, or a right-click). That control answers for itself; this is
    // not a click on the tab.
    if (!d) return;

    if (d.active) {
      const idx = indexAt(e.clientX, e.clientY, d.tab);
      if (idx !== null) tabPrefs.move(d.tab, idx);
    } else {
      tabPrefs.setActive(tab);
    }
    endDrag();
  };

  return (
    <div className="pane-head tabs inspector-tabs" role="tablist" aria-label="Tools" ref={stripRef}>
      {visible.map((id, i) => {
        const on = prefs.active === id;
        const dragging = dragId === id;
        return (
          <div
            key={id}
            className={`tab ${on ? "on" : ""} ${dragging ? "dragging" : ""} ${
              overIndex === i && dragId !== null && !dragging ? "drop-target" : ""
            }`}
            data-tab-index={i}
            data-tab-id={id}
            role="tab"
            aria-selected={on}
            aria-controls={PANEL_ID}
            tabIndex={0}
            title={`${TAB_DEFS[id].title} — drag to reorder, or Alt+← / Alt+→`}
            style={{
              // Drag mechanics, not decoration, so they live beside the code
              // that depends on them: without touch-action a finger drag
              // scrolls the pane instead of moving the tab, and without the
              // selection guard the strip highlights its own labels mid-drag.
              touchAction: "none",
              userSelect: "none",
              ...(dragging && offset
                ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
                : null),
            }}
            onPointerDown={(e) => onPointerDown(e, id)}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerUp(e, id)}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                tabPrefs.setActive(id);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const dir = e.key === "ArrowRight" ? 1 : -1;
                // Alt rearranges, a bare arrow walks the strip. One modifier
                // apart, so the gesture for moving a tab is a single step
                // from the navigation everyone tries first.
                if (e.altKey) {
                  tabPrefs.nudge(id, dir);
                } else {
                  const next = cycleTab(id, visible, dir);
                  tabPrefs.setActive(next);
                  focusTab(next);
                }
              }
            }}
          >
            {TAB_DEFS[id].label}
            {/* The last tab keeps its ✕ hidden rather than disabled: a
                control that refuses is worse than one that isn't offered. */}
            {visible.length > 1 && (
              <button
                className="tab-close"
                data-no-drag
                aria-label={`Close ${TAB_DEFS[id].label}`}
                title={`Close ${TAB_DEFS[id].label} — the + brings it back`}
                onClick={(e) => {
                  e.stopPropagation();
                  tabPrefs.hide(id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      <div className="tab-plus-wrap" ref={plusRef}>
        <button
          className="tab tab-plus"
          aria-expanded={plusOpen}
          aria-haspopup="true"
          title="Add a tool back, or rearrange the tabs"
          onClick={() => setPlusOpen((v) => !v)}
        >
          +
        </button>

        {plusOpen && (
          <div className="tab-plus-pop" aria-label="Arrange tools">
            <p className="tab-plus-title">Add</p>
            {hidden.length === 0 ? (
              <p className="tab-plus-hint">Every tool is already here.</p>
            ) : (
              hidden.map((id) => (
                <button
                  key={id}
                  title={TAB_DEFS[id].title}
                  onClick={() => {
                    tabPrefs.show(id);
                    // Adding closes the menu — you asked for that tool, so
                    // the next thing you want is to see it.
                    setPlusOpen(false);
                  }}
                >
                  <span className="tab-plus-check">+</span>
                  {TAB_DEFS[id].label}
                </button>
              ))
            )}

            {/* The keyboard's route to everything the drag does. It stays
                open while you use it: rearranging is rarely one move. */}
            <p className="tab-plus-title">Arrange</p>
            {visible.map((id, i) => (
              <div className="tab-plus-row" key={id}>
                <span className="tab-plus-name">{TAB_DEFS[id].label}</span>
                <button
                  className="tab-plus-move"
                  disabled={i === 0}
                  aria-label={`Move ${TAB_DEFS[id].label} left`}
                  title="Move left"
                  onClick={() => tabPrefs.nudge(id, -1)}
                >
                  ◀
                </button>
                <button
                  className="tab-plus-move"
                  disabled={i === visible.length - 1}
                  aria-label={`Move ${TAB_DEFS[id].label} right`}
                  title="Move right"
                  onClick={() => tabPrefs.nudge(id, 1)}
                >
                  ▶
                </button>
                <button
                  className="tab-plus-move"
                  disabled={visible.length <= 1}
                  aria-label={`Remove ${TAB_DEFS[id].label}`}
                  title="Take it off the strip"
                  onClick={() => tabPrefs.hide(id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <p className="tab-plus-hint">Drag a tab to move it, or use these arrows.</p>
          </div>
        )}
      </div>
    </div>
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
          <div className="empty-state">
            <span className="empty-glyph" aria-hidden>
              §
            </span>
            <p className="empty-line">Nothing references this yet.</p>
          </div>
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
              <div key={name} className="link-row unresolved" data-tip="Not yet written">
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
          <div className="empty-state">
            <span className="empty-glyph" aria-hidden>
              ❧
            </span>
            <p className="empty-line">No codex entries referenced yet.</p>
          </div>
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
          <label className="btn-ghost upload-style" data-tip="Import a .txt or .md file as a style">
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
            style={{ minWidth: 150 }}
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden /> Writing…
              </>
            ) : chosen ? (
              `Run “${chosen.title}”`
            ) : (
              "Continue the scene"
            )}
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
            <div className={busy ? "generated stream-caret" : "generated"}>{output}</div>
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
  if (state === "checking")
    return (
      <p className="hint">
        <span className="spinner" aria-hidden /> Checking for Ollama…
      </p>
    );

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
