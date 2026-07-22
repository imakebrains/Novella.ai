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
import { store, useVaultVersion } from "../state/vaultStore";
import { providerAvailable } from "../ai/generate";

/* Managing the standing orders.

   The form asks three questions — what should it do, what may it read,
   when should it run — because that's the entire contract of an agent.
   Reports are ordinary notes; "View report" jumps straight to one. */

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

export function AgentsPanel({ onOpenNote }: { onOpenNote: () => void }) {
  useVaultVersion();
  const agents = useAgents();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [scope, setScope] = useState<AgentScope>("manuscript");
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("daily");
  const [minutes, setMinutes] = useState(30);
  const [runningId, setRunningId] = useState<string | null>(null);

  const add = () => {
    if (!instructions.trim()) return;
    agentStore.add({
      name: name.trim() || "Unnamed agent",
      instructions: instructions.trim(),
      scope,
      trigger: buildTrigger(triggerKind, minutes),
      enabled: true,
    });
    setName("");
    setInstructions("");
    setFormOpen(false);
  };

  const runNow = async (agent: Agent) => {
    setRunningId(agent.id);
    try {
      await runAgent(agent);
    } finally {
      setRunningId(null);
    }
  };

  const openReport = (agent: Agent) => {
    const note = store.vault.resolveLink(`Agent: ${agent.name}`);
    if (note) {
      store.open(note.id);
      onOpenNote();
    }
  };

  return (
    <>
      <p className="hint">
        Standing orders for this project: what to do, what to read, when to run. Agents
        write their findings to their own notes — they never touch your prose. They run
        while Novella is open (minimized counts); there's no server behind them.
      </p>

      {!providerAvailable() && (
        <div className="notice error-notice">
          No AI provider is connected, so agents can't run. Set one up under Connections.
        </div>
      )}

      {agents.length === 0 && (
        <section className="settings-group">
          <h3 className="settings-cat">Start with one of these</h3>
          <div className="agent-templates">
            {AGENT_TEMPLATES.map((t) => (
              <button
                key={t.name}
                className="agent-template"
                onClick={() => agentStore.add(t)}
                title={t.instructions}
              >
                <span className="agent-template-name">{t.name}</span>
                <span className="agent-template-when">{describeTrigger(t.trigger)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {agents.length > 0 && (
        <section className="settings-group">
          <div className="agent-list">
            {agents.map((agent) => (
              <div key={agent.id} className={`agent-row ${agent.enabled ? "" : "off"}`}>
                <div className="agent-main">
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-when">
                    {describeTrigger(agent.trigger)} ·{" "}
                    {SCOPES.find((s) => s.id === agent.scope)?.label.toLowerCase()}
                  </span>
                  <span className="agent-last">
                    {agent.lastRunAt === null
                      ? "never run"
                      : `${agent.lastStatus === "error" ? "failed" : "ran"} ${new Date(agent.lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                  {agent.lastStatus === "error" && agent.lastError && (
                    <span className="agent-error">{agent.lastError}</span>
                  )}
                </div>
                <div className="agent-actions">
                  <label className="switch" title={agent.enabled ? "On" : "Off"}>
                    <input
                      type="checkbox"
                      checked={agent.enabled}
                      onChange={(e) => agentStore.update(agent.id, { enabled: e.target.checked })}
                    />
                  </label>
                  <button
                    className="btn-ghost"
                    disabled={runningId !== null}
                    onClick={() => void runNow(agent)}
                  >
                    {runningId === agent.id ? "Running…" : "Run now"}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={!store.vault.resolveLink(`Agent: ${agent.name}`)}
                    onClick={() => openReport(agent)}
                    title="Open this agent's report note"
                  >
                    Report
                  </button>
                  <button
                    className="btn-ghost danger"
                    onClick={() => {
                      if (confirm(`Delete the "${agent.name}" agent? Its report note stays.`)) {
                        agentStore.remove(agent.id);
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {agents.length > 0 && (
            <div className="agent-templates compact">
              {AGENT_TEMPLATES.filter((t) => !agents.some((a) => a.name === t.name)).map((t) => (
                <button
                  key={t.name}
                  className="preset-chip"
                  onClick={() => agentStore.add(t)}
                  title={t.instructions}
                >
                  + {t.name}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="settings-group">
        {!formOpen ? (
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            New agent
          </button>
        ) : (
          <div className="agent-form">
            <input
              className="search bare"
              value={name}
              placeholder="Name — e.g. Timeline warden"
              onChange={(e) => setName(e.target.value)}
              aria-label="Agent name"
            />
            <textarea
              className="agent-instructions"
              value={instructions}
              placeholder="What should it do? Written like a brief to a sharp assistant."
              rows={4}
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
                <select
                  value={triggerKind}
                  onChange={(e) => setTriggerKind(e.target.value as TriggerKind)}
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
                    onChange={(e) => setMinutes(Number(e.target.value) || 30)}
                  />
                </label>
              )}
            </div>
            <div className="btn-row">
              <button className="btn-primary" onClick={add} disabled={!instructions.trim()}>
                Add agent
              </button>
              <button className="btn-ghost" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
