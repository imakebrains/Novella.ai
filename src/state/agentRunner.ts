import { generate, NoProviderError } from "../ai/generate";
import { store } from "./vaultStore";
import { agentIsDue, agentStore, describeTrigger, type Agent, type AgentScope } from "./agents";

/* ============================================================
   The agent runner

   Watches for due agents and runs them one at a time through the
   connected AI provider. Reports go to the agent's own note,
   newest section first — never into the manuscript.

   Failure is normal here (no provider connected, model asleep,
   machine offline). A failed run records its error on the agent
   and tries again at the next trigger; it never throws upward or
   interrupts writing.
   ============================================================ */

/** Context caps. Local models have modest windows, and an agent that
    overflows one fails silently badly — trimmed but labelled beats big
    but broken. Newest prose survives trimming first. */
const SCOPE_CAP = 22_000;

function trimHead(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `[…earlier material omitted for length…]\n\n${text.slice(text.length - cap)}`;
}

/** Assemble what an agent is allowed to read. */
export function buildAgentContext(scope: AgentScope): string {
  const chapters = () =>
    store
      .orderedChapters()
      .map((c) => `## ${c.title}\n\n${c.body}`.trim())
      .join("\n\n");

  const codex = () =>
    store.vault
      .all()
      .filter((n) => n.type !== "chapter" && n.type !== "scene" && n.type !== "prompt")
      .map((n) => `## ${n.title} (${n.type})\n\n${n.body}`.trim())
      .join("\n\n");

  switch (scope) {
    case "active-chapter": {
      const active = store.active();
      const note =
        active && (active.type === "chapter" || active.type === "scene")
          ? active
          : store.orderedChapters()[0];
      if (!note) return "";
      return trimHead(`## ${note.title}\n\n${note.body}`, SCOPE_CAP);
    }
    case "manuscript":
      return trimHead(chapters(), SCOPE_CAP);
    case "codex":
      return trimHead(codex(), SCOPE_CAP);
    case "everything":
      return trimHead(`# CODEX\n\n${codex()}\n\n# MANUSCRIPT\n\n${chapters()}`, SCOPE_CAP * 1.5);
  }
}

function reportSlug(name: string): string {
  return name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "agent";
}

/** Append a dated report section to the agent's note, newest first. */
function writeReport(agent: Agent, body: string): void {
  const title = `Agent: ${agent.name}`;
  const when = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const section = `## ${when}\n\n${body.trim()}\n`;

  const existing = store.vault.resolveLink(title);
  if (existing) {
    const parts = existing.body.split(/\n(?=## )/);
    // The intro paragraph (before any section) stays on top; the new
    // section goes right after it; keep the latest 20 runs.
    const intro = parts[0]?.startsWith("## ") ? "" : (parts.shift() ?? "");
    const kept = [section, ...parts.filter((p) => p.startsWith("## "))].slice(0, 20);
    store.setBody(existing.id, `${intro.trim()}\n\n${kept.join("\n")}`.trim());
  } else {
    store.createNoteAtPath(
      `Notes/Agents/${reportSlug(agent.name)}.md`,
      `---\ntype: note\nname: "${title.replace(/"/g, '\\"')}"\n---\nWritten by the "${agent.name}" agent — ${describeTrigger(agent.trigger)}. Newest report first.\n\n${section}`,
    );
  }
}

let running = false;

/** Run one agent now. Returns true when a report was written. */
export async function runAgent(agent: Agent): Promise<boolean> {
  if (running) return false; // one at a time; the next trigger retries
  running = true;
  try {
    const context = buildAgentContext(agent.scope);
    const output = await generate({
      system:
        "You are a working assistant for a novelist, running unattended. Be specific, quote briefly, and keep to the task. Plain Markdown. No preamble, no sign-off.",
      prompt: `${agent.instructions}\n\n---\n\nMATERIAL:\n\n${context || "(the project is empty so far)"}`,
      maxTokens: 900,
    });
    writeReport(agent, output);
    agentStore.update(agent.id, { lastRunAt: Date.now(), lastStatus: "ok", lastError: null });
    return true;
  } catch (err) {
    const message =
      err instanceof NoProviderError
        ? "No AI provider is connected — see Settings → Connections."
        : err instanceof Error
          ? err.message
          : String(err);
    agentStore.update(agent.id, { lastRunAt: Date.now(), lastStatus: "error", lastError: message });
    return false;
  } finally {
    running = false;
  }
}

async function runDue(event: "app-open" | "save" | "tick"): Promise<void> {
  const agents = await agentStore.ready();
  const now = Date.now();
  for (const agent of agents) {
    if (agentIsDue(agent, event, now)) {
      // Sequential on purpose — local models handle one job at a time.
      await runAgent(agent);
    }
  }
}

let installed = false;

/** Wire the scheduler into the app. Idempotent; called once from boot. */
export function installAgentRunner(): void {
  if (installed) return;
  installed = true;

  // The vault swap that opens a project counts as "the app opened" for
  // that project's agents — it's the moment their world exists.
  store.onVaultReplaced(() => {
    // Give the swap a beat to settle (active note, banners) before
    // spending the writer's CPU on background work.
    window.setTimeout(() => void runDue("app-open"), 4_000);
  });

  store.onAfterSave(() => void runDue("save"));

  window.setInterval(() => void runDue("tick"), 60_000);
}
