import { useState } from "react";
import {
  AGENT_TEMPLATES,
  agentStore,
  describeTrigger,
  useAgents,
  type Agent,
  type AgentScope,
  type AgentTrigger,
} from "../state/agents";
import { runAgent } from "../state/agentRunner";
import { showUndo } from "../state/undo";
import { store, useVaultVersion } from "../state/vaultStore";
import { providerAvailable } from "../ai/generate";

/* Managing the standing orders — the Obsidian treatment.

   The list answers "what do I have and is it working"; clicking any
   agent (or template) opens a DETAIL view in this same tab: what it
   does in plain words, a sample of the report it writes, what it reads,
   when it runs, and its full editable brief. Nobody should have to
   enable a thing to find out what it is. */

const SCOPES: { id: AgentScope; label: string }[] = [
  { id: "active-chapter", label: "Open chapter" },
  { id: "manuscript", label: "Whole manuscript" },
  { id: "codex", label: "Codex" },
  { id: "everything", label: "Everything" },
];

type TriggerKind = AgentTrigger["kind"];

const TRIGGERS: { id: TriggerKind; label: string }[] = [
  { id: "daily", label: "Once a day" },
  { id: "app-open", label: "When Novella opens" },
  { id: "on-save", label: "After saves" },
  { id: "interval", label: "Every N minutes" },
  { id: "manual", label: "Only when I run it" },
];

function buildTrigger(kind: TriggerKind, minutes: number): AgentTrigger {
  if (kind === "on-save") return { kind, cooldownMinutes: Math.max(5, minutes) };
  if (kind === "interval") return { kind, minutes: Math.max(10, minutes) };
  return { kind } as AgentTrigger;
}

type View =
  | { kind: "list" }
  | { kind: "agent"; id: string }
  | { kind: "template"; name: string }
  | { kind: "new" };

export function AgentsPanel({ onOpenNote }: { onOpenNote: () => void }) {
  useVaultVersion();
  const agents = useAgents();
  const [view, setView] = useState<View>({ kind: "list" });
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);

  const runNow = async (agent: Agent) => {
    setRunningId(agent.id);
    try {
      await runAgent(agent);
    } finally {
      setRunningId(null);
    }
  };

  // Sequential on purpose: five agents in parallel is five simultaneous
  // model calls against the same provider, and their reports would race
  // for the same notes.
  const runAll = async () => {
    setRunningAll(true);
    try {
      for (const agent of agentStore.all().filter((a) => a.enabled)) {
        setRunningId(agent.id);
        await runAgent(agent);
      }
    } finally {
      setRunningId(null);
      setRunningAll(false);
    }
  };

  if (view.kind === "agent") {
    const agent = agents.find((a) => a.id === view.id);
    if (!agent) {
      setView({ kind: "list" });
      return null;
    }
    return (
      <AgentDetail
        agent={agent}
        running={runningId === agent.id}
        onBack={() => setView({ kind: "list" })}
        onRun={() => void runNow(agent)}
        onOpenNote={onOpenNote}
      />
    );
  }

  if (view.kind === "template") {
    const t = AGENT_TEMPLATES.find((x) => x.name === view.name);
    if (!t) {
      setView({ kind: "list" });
      return null;
    }
    return (
      <TemplateDetail
        template={t}
        installed={agents.some((a) => a.name === t.name)}
        onBack={() => setView({ kind: "list" })}
        onAdd={() => {
          const added = agentStore.add(t);
          setView({ kind: "agent", id: added.id });
        }}
      />
    );
  }

  if (view.kind === "new") {
    return (
      <NewAgentForm
        onBack={() => setView({ kind: "list" })}
        onCreated={(id) => setView({ kind: "agent", id })}
      />
    );
  }

  return (
    <>
      <p className="hint">
        Standing orders for this project. Agents write findings to their own notes — they
        never touch your prose — and they run while Novella is open; there's no server
        behind them. Click one to see exactly what it does.
      </p>

      {!providerAvailable() && (
        <div className="notice error-notice">
          No AI provider is connected, so agents can't run. Set one up under Connections.
        </div>
      )}

      {agents.length > 0 && (
        <section className="settings-group">
          <div className="agent-list-head">
            <h3 className="settings-cat">Your agents</h3>
            {agents.some((a) => a.enabled) && (
              <button
                className="btn-ghost"
                disabled={runningAll || runningId !== null || !providerAvailable()}
                onClick={() => void runAll()}
                title="Run every enabled agent once, top to bottom"
              >
                {runningAll ? "Running…" : "Run all now"}
              </button>
            )}
          </div>
          <div className="agent-list">
            {agents.map((agent, i) => (
              <button key={agent.id} className={`agent-row ${agent.enabled ? "" : "off"}`} onClick={() => setView({ kind: "agent", id: agent.id })}>
                <div className="agent-main">
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-desc">{agent.description || agent.instructions.slice(0, 90)}</span>
                  <span className="agent-last">
                    {runningId === agent.id
                      ? "running now…"
                      : `${describeTrigger(agent.trigger)} · ${
                          agent.lastRunAt === null
                            ? "never run"
                            : `${agent.lastStatus === "error" ? "failed" : "ran"} ${new Date(agent.lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                        }`}
                  </span>
                </div>
                <span className="agent-order" onClick={(e) => e.stopPropagation()}>
                  <span
                    role="button"
                    tabIndex={0}
                    className="agent-nudge"
                    aria-disabled={i === 0}
                    title="Move up"
                    onClick={() => agentStore.move(agent.id, -1)}
                    onKeyDown={(e) => e.key === "Enter" && agentStore.move(agent.id, -1)}
                  >
                    ↑
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="agent-nudge"
                    aria-disabled={i === agents.length - 1}
                    title="Move down"
                    onClick={() => agentStore.move(agent.id, 1)}
                    onKeyDown={(e) => e.key === "Enter" && agentStore.move(agent.id, 1)}
                  >
                    ↓
                  </span>
                </span>
                <span className={`agent-state-dot ${runningId === agent.id ? "busy" : agent.enabled ? (agent.lastStatus === "error" ? "err" : "on") : ""}`} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="settings-group">
        <h3 className="settings-cat">{agents.length ? "Add another" : "Start with one of these"}</h3>
        <div className="agent-templates">
          {AGENT_TEMPLATES.map((t) => {
            const installed = agents.some((a) => a.name === t.name);
            return (
              <button
                key={t.name}
                className={`agent-template ${installed ? "installed" : ""}`}
                onClick={() => setView({ kind: "template", name: t.name })}
              >
                <span className="agent-template-name">
                  {t.name}
                  {installed && <span className="agent-installed-mark"> ✓</span>}
                </span>
                <span className="agent-template-desc">{t.description}</span>
                <span className="agent-template-when">{describeTrigger(t.trigger)}</span>
              </button>
            );
          })}
        </div>
        <div className="btn-row">
          <button className="btn-primary" onClick={() => setView({ kind: "new" })}>
            Write your own
          </button>
        </div>
      </section>
    </>
  );
}

/* ---------------- template detail ---------------- */

function TemplateDetail({
  template,
  installed,
  onBack,
  onAdd,
}: {
  template: (typeof AGENT_TEMPLATES)[number];
  installed: boolean;
  onBack: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="agent-detail">
      <button className="btn-ghost agent-back" onClick={onBack}>
        ‹ All agents
      </button>
      <h3 className="agent-detail-name">{template.name}</h3>
      <p className="agent-detail-desc">{template.description}</p>

      <DetailMeta scope={template.scope} trigger={template.trigger} />

      <div className="settings-section-label">A report from this agent looks like</div>
      <pre className="agent-example">{template.example}</pre>

      <div className="settings-section-label">Its full brief (editable after adding)</div>
      <p className="agent-brief">{template.instructions}</p>

      <div className="btn-row">
        {installed ? (
          <p className="hint">Already added — it's in your agents list.</p>
        ) : (
          <button className="btn-primary" onClick={onAdd}>
            Add this agent
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- agent detail ---------------- */

function AgentDetail({
  agent,
  running,
  onBack,
  onRun,
  onOpenNote,
}: {
  agent: Agent;
  running: boolean;
  onBack: () => void;
  onRun: () => void;
  onOpenNote: () => void;
}) {
  const report = store.vault.resolveLink(`Agent: ${agent.name}`);
  const triggerKind = agent.trigger.kind;
  const minutes =
    agent.trigger.kind === "interval"
      ? agent.trigger.minutes
      : agent.trigger.kind === "on-save"
        ? agent.trigger.cooldownMinutes
        : 30;

  return (
    <div className="agent-detail">
      <button className="btn-ghost agent-back" onClick={onBack}>
        ‹ All agents
      </button>

      <div className="agent-detail-head">
        <h3 className="agent-detail-name">{agent.name}</h3>
        <label className="switch" title={agent.enabled ? "On" : "Off"}>
          <input
            type="checkbox"
            checked={agent.enabled}
            onChange={(e) => agentStore.update(agent.id, { enabled: e.target.checked })}
          />
        </label>
      </div>
      {agent.description && <p className="agent-detail-desc">{agent.description}</p>}

      <DetailMeta scope={agent.scope} trigger={agent.trigger} />

      <div className="agent-status-line">
        {agent.lastRunAt === null ? (
          <span className="hint">Never run yet.</span>
        ) : agent.lastStatus === "error" ? (
          <span className="agent-error">Last run failed: {agent.lastError}</span>
        ) : (
          <span className="hint">
            Last ran {new Date(agent.lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} ✓
          </span>
        )}
      </div>

      <div className="btn-row">
        <button className="btn-primary" disabled={running} onClick={onRun}>
          {running ? "Running…" : "Run now"}
        </button>
        <button
          className="btn-ghost"
          disabled={!report}
          title={report ? "Open this agent's report note" : "No reports yet"}
          onClick={() => {
            if (report) {
              store.open(report.id);
              onOpenNote();
            }
          }}
        >
          Open reports
        </button>
      </div>

      {agent.example && (
        <>
          <div className="settings-section-label">A report looks like</div>
          <pre className="agent-example">{agent.example}</pre>
        </>
      )}

      <div className="settings-section-label">The brief</div>
      <textarea
        className="agent-instructions"
        rows={5}
        value={agent.instructions}
        onChange={(e) => agentStore.update(agent.id, { instructions: e.target.value })}
        aria-label="Agent instructions"
      />

      <div className="agent-form-row">
        <label>
          Reads
          <select
            value={agent.scope}
            onChange={(e) => agentStore.update(agent.id, { scope: e.target.value as AgentScope })}
          >
            {SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Runs
          <select
            value={triggerKind}
            onChange={(e) =>
              agentStore.update(agent.id, {
                trigger: buildTrigger(e.target.value as TriggerKind, minutes),
              })
            }
          >
            {TRIGGERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {(triggerKind === "interval" || triggerKind === "on-save") && (
          <label>
            {triggerKind === "interval" ? "Minutes" : "Cooldown (min)"}
            <input
              type="number"
              min={triggerKind === "interval" ? 10 : 5}
              value={minutes}
              onChange={(e) =>
                agentStore.update(agent.id, {
                  trigger: buildTrigger(triggerKind, Number(e.target.value) || 30),
                })
              }
            />
          </label>
        )}
      </div>

      <button
        className="btn-ghost danger agent-delete"
        title="Removes the agent. Its report note stays, and Undo is offered."
        onClick={() => {
          const snapshot = { ...agent };
          agentStore.remove(agent.id);
          onBack();
          showUndo(`Deleted the “${snapshot.name}” agent`, () => agentStore.restore(snapshot));
        }}
      >
        Delete this agent
      </button>
    </div>
  );
}

function DetailMeta({ scope, trigger }: { scope: AgentScope; trigger: AgentTrigger }) {
  return (
    <div className="agent-meta">
      <span className="agent-meta-item">
        <span className="agent-meta-key">Reads</span>
        {SCOPES.find((s) => s.id === scope)?.label}
      </span>
      <span className="agent-meta-item">
        <span className="agent-meta-key">Runs</span>
        {describeTrigger(trigger)}
      </span>
      <span className="agent-meta-item">
        <span className="agent-meta-key">Writes</span>
        its own report note
      </span>
    </div>
  );
}

/* ---------------- new agent ---------------- */

function NewAgentForm({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [scope, setScope] = useState<AgentScope>("manuscript");
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("daily");
  const [minutes, setMinutes] = useState(30);

  return (
    <div className="agent-detail">
      <button className="btn-ghost agent-back" onClick={onBack}>
        ‹ All agents
      </button>
      <h3 className="agent-detail-name">Write your own</h3>
      <p className="hint">
        Brief it like a sharp assistant: what to look for, what to produce. It reports to
        its own note and never edits your prose.
      </p>

      <input
        className="search bare"
        value={name}
        placeholder="Name — e.g. Timeline warden"
        onChange={(e) => setName(e.target.value)}
        aria-label="Agent name"
      />
      <input
        className="search bare"
        value={description}
        placeholder="One line on what it's for (shown on its card)"
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Agent description"
      />
      <textarea
        className="agent-instructions"
        value={instructions}
        placeholder="The brief. e.g. Check every date and day-of-week mentioned against the chapter order and list contradictions with quotes."
        rows={5}
        onChange={(e) => setInstructions(e.target.value)}
        aria-label="Agent instructions"
      />
      <div className="agent-form-row">
        <label>
          Reads
          <select value={scope} onChange={(e) => setScope(e.target.value as AgentScope)}>
            {SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Runs
          <select value={triggerKind} onChange={(e) => setTriggerKind(e.target.value as TriggerKind)}>
            {TRIGGERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {(triggerKind === "interval" || triggerKind === "on-save") && (
          <label>
            {triggerKind === "interval" ? "Minutes" : "Cooldown (min)"}
            <input
              type="number"
              min={triggerKind === "interval" ? 10 : 5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || 30)}
            />
          </label>
        )}
      </div>
      <div className="btn-row">
        <button
          className="btn-primary"
          disabled={!instructions.trim()}
          onClick={() => {
            const added = agentStore.add({
              name: name.trim() || "Unnamed agent",
              description: description.trim(),
              example: "",
              instructions: instructions.trim(),
              scope,
              trigger: buildTrigger(triggerKind, minutes),
              enabled: true,
            });
            onCreated(added.id);
          }}
        >
          Add agent
        </button>
        <button className="btn-ghost" onClick={onBack}>
          Cancel
        </button>
      </div>
    </div>
  );
}
