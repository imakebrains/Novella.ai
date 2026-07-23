import { useSyncExternalStore } from "react";
import { storage } from "../storage";
import { store } from "./vaultStore";
import { dayKey } from "./sessions";

/* ============================================================
   Agents

   A writer's standing orders: "every morning, recap yesterday's
   chapters"; "after I save, check the new prose for continuity
   slips"; "every hour, tend the codex." Each agent is a saved
   instruction with a scope and a trigger, run through whatever AI
   provider is connected.

   Two rules keep them trustworthy:

   1. REPORTS, NOT EDITS. An agent writes its findings to its own
      note (Notes/Agents/…), newest first. It never touches the
      manuscript. The writer reads, judges, and acts — or doesn't.

   2. HONEST SCHEDULING. There is no server. Agents run while
      Novella is open — including minimized on the desktop — and
      the UI says so instead of promising a cloud that isn't there.

   Definitions live in .novella/agents.json: standing orders are
   part of the book's working method, so they travel with it.
   ============================================================ */

export type AgentScope = "active-chapter" | "manuscript" | "codex" | "everything";

export type AgentTrigger =
  | { kind: "manual" }
  | { kind: "app-open" }
  | { kind: "daily" }
  | { kind: "on-save"; cooldownMinutes: number }
  | { kind: "interval"; minutes: number };

export interface Agent {
  id: string;
  name: string;
  /** What this agent is FOR, in a sentence — shown on cards and lists. */
  description: string;
  /** A short sample of the kind of report it writes, so you know what
      you're signing up for before it ever runs. */
  example: string;
  /** What it's asked to do, in the writer's words. */
  instructions: string;
  scope: AgentScope;
  trigger: AgentTrigger;
  enabled: boolean;
  lastRunAt: number | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
}

/* ---------- pure trigger logic ---------- */

/** Is this agent due to run, given what just happened?

    `event` is what woke the scheduler: the app opening, a save landing,
    or the periodic tick. Manual agents are never "due" — they run when
    the writer presses the button, and only then. */
export function agentIsDue(
  agent: Agent,
  event: "app-open" | "save" | "tick",
  now: number,
): boolean {
  if (!agent.enabled) return false;
  const t = agent.trigger;

  switch (t.kind) {
    case "manual":
      return false;
    case "app-open":
      return event === "app-open";
    case "daily":
      // First opportunity of each calendar day, whatever the event.
      return agent.lastRunAt === null || dayKey(new Date(agent.lastRunAt)) !== dayKey(new Date(now));
    case "on-save":
      if (event !== "save") return false;
      return (
        agent.lastRunAt === null || now - agent.lastRunAt >= t.cooldownMinutes * 60_000
      );
    case "interval":
      if (event !== "tick" && event !== "app-open") return false;
      return agent.lastRunAt === null || now - agent.lastRunAt >= t.minutes * 60_000;
  }
}

/** One line describing a trigger, for lists and summaries. */
export function describeTrigger(t: AgentTrigger): string {
  switch (t.kind) {
    case "manual":
      return "runs when you say so";
    case "app-open":
      return "when Novella opens";
    case "daily":
      return "once a day";
    case "on-save":
      return `after saves (at most every ${t.cooldownMinutes} min)`;
    case "interval":
      return `every ${t.minutes} min while open`;
  }
}

/* ---------- templates ---------- */

export const AGENT_TEMPLATES: Omit<Agent, "id" | "lastRunAt" | "lastStatus" | "lastError">[] = [
  {
    name: "Continuity sentinel",
    description:
      "Reads the whole manuscript once a day and lists continuity slips — names spelled two ways, eyes that change colour, timelines that don't add up.",
    example:
      "• Ch 2: Mira's scarf is \"emerald\"; Ch 5 calls it \"grey wool\" — same scarf?\n• Ch 3 says the funeral was \"last spring\", Ch 4 says \"two winters back\".",
    instructions:
      "Read the manuscript for continuity slips: names spelled two ways, physical details that change, timeline impossibilities, objects that vanish or teleport, weather or seasons that contradict. List each suspected slip with the chapter it appears in and a one-line quote. If you find nothing, say so briefly.",
    scope: "manuscript",
    trigger: { kind: "daily" },
    enabled: true,
  },
  {
    name: "Story-so-far recap",
    description:
      "When you open Novella, a fresh 200-word editor's note on where the story stands and the most pressing open question — so you start writing, not re-reading.",
    example:
      "Wren has traded the memory and doesn't know what she lost. The map contradicts the coast. Open thread: nobody has explained why the Archivist wanted THAT memory.",
    instructions:
      "Summarise the current state of the manuscript in under 200 words: where the story stands, which threads are open, and the single most pressing unanswered question. Write it as a note from an attentive editor, not a book report.",
    scope: "manuscript",
    trigger: { kind: "app-open" },
    enabled: true,
  },
  {
    name: "Prose doctor",
    description:
      "Half an hour after you save, it critiques the open chapter's prose — echoes, filter words, dialogue that explains instead of speaks — with quoted examples.",
    example:
      "• \"suddenly\" appears 4× in this chapter — each steals the surprise it announces.\n• \"She felt the cold creep in\" → let the cold act: \"The cold crept in.\"",
    instructions:
      "Critique the current chapter's prose: flag echoes (repeated distinctive words), filter words, sentences that trip the tongue, and dialogue that explains instead of speaks. Quote each offender briefly and suggest one sharper alternative. Be specific and kind.",
    scope: "active-chapter",
    trigger: { kind: "on-save", cooldownMinutes: 30 },
    enabled: true,
  },
  {
    name: "Codex gardener",
    description:
      "Compares the codex to the manuscript daily: who's in the prose but missing an entry, which entries the prose contradicts, what's gone stale.",
    example:
      "• \"Doctor Halloway\" appears in Ch 2 and 4 — no codex entry yet.\n• Codex says the Drift moves nightly; Ch 3 has it resting \"a fortnight\".",
    instructions:
      "Compare the codex to the manuscript. List: characters or places named in prose that have no codex entry; entries the prose never mentions; and codex facts the prose contradicts. Give file-worthy one-line suggestions, nothing more.",
    scope: "everything",
    trigger: { kind: "daily" },
    enabled: true,
  },
  {
    name: "Grammar sweep",
    description:
      "A nightly pass over the open chapter for typos, doubled words, missing punctuation and tense slips — the mechanical stuff, quoted so it's easy to find.",
    example:
      "• \"the the harbor\" — doubled word.\n• \"She walk to the gate\" — tense slip (walks/walked).",
    instructions:
      "Proofread the current chapter for mechanics only: typos, doubled words, missing or doubled punctuation, tense slips, subject-verb disagreements. Quote each error with enough surrounding words to find it. Do not comment on style or story.",
    scope: "active-chapter",
    trigger: { kind: "daily" },
    enabled: true,
  },
];

/* ---------- persistence ---------- */

const FILE = ".novella/agents.json";

function lsKey(): string {
  return `novella.agents.${store.vaultRoot() ?? "app"}`;
}

let cached: Agent[] = [];
let loadedFor: string | null | undefined; // undefined = never loaded
const listeners = new Set<() => void>();
let version = 0;

/* The load/persist race guard. Mutating before the current root's file has
   been read — trivially easy right after a project opens — used to persist
   the empty post-reset cache over the real file. Every persist now waits
   for the load; the load merges instead of clobbering in-flight edits. */
let loadPromise: Promise<void> | null = null;
let mutatedSinceLoad = false;

function ensureLoaded(): Promise<void> {
  if (loadedFor === store.vaultRoot() && loadPromise === null) return Promise.resolve();
  loadPromise ??= load().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

async function persistSafely(): Promise<void> {
  await ensureLoaded();
  await persist();
}

function emit(): void {
  version++;
  for (const l of listeners) l();
}

function normalize(raw: unknown): Agent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Agent => !!a && typeof a === "object" && "id" in a && "trigger" in a)
    // Agents saved before descriptions existed load with empty ones.
    .map((a) => ({ ...a, description: a.description ?? "", example: a.example ?? "" }));
}

async function load(): Promise<void> {
  const root = store.vaultRoot();
  loadedFor = root;
  let agents: Agent[] = [];
  if (root) {
    try {
      const bytes = await storage().readBytes(root, FILE);
      if (bytes) agents = normalize(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      /* corrupt or missing config must never block the app */
    }
  } else {
    try {
      agents = normalize(JSON.parse(localStorage.getItem(lsKey()) ?? "[]"));
    } catch {
      /* same */
    }
  }
  if (mutatedSinceLoad) {
    const local = new Map(cached.map((a) => [a.id, a]));
    cached = [...agents.filter((a) => !local.has(a.id)), ...local.values()];
  } else {
    cached = agents;
  }
  mutatedSinceLoad = false;
  emit();
}

async function persist(): Promise<void> {
  const root = store.vaultRoot();
  const json = JSON.stringify(cached);
  if (root) {
    try {
      await storage().writeBytes(root, FILE, new TextEncoder().encode(json));
    } catch {
      /* best-effort */
    }
  } else {
    try {
      localStorage.setItem(lsKey(), json);
    } catch {
      /* quota */
    }
  }
}

function newId(): string {
  return `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const agentStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  all(): Agent[] {
    if (loadedFor !== store.vaultRoot()) void load();
    return cached;
  },

  /** Wait for the current project's agents to actually be loaded — the
      runner needs the real list, not a stale or empty cache. */
  async ready(): Promise<Agent[]> {
    if (loadedFor !== store.vaultRoot()) await load();
    return cached;
  },

  add(input: Omit<Agent, "id" | "lastRunAt" | "lastStatus" | "lastError">): Agent {
    const agent: Agent = { ...input, id: newId(), lastRunAt: null, lastStatus: null, lastError: null };
    cached = [...cached, agent];
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
    return agent;
  },

  update(id: string, patch: Partial<Omit<Agent, "id">>): void {
    cached = cached.map((a) => (a.id === id ? { ...a, ...patch } : a));
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
  },

  remove(id: string): void {
    cached = cached.filter((a) => a.id !== id);
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
  },

  /** Nudge an agent up or down the list. Order is presentation AND run
      order for "run all", so it's worth persisting. */
  move(id: string, dir: -1 | 1): void {
    const at = cached.findIndex((a) => a.id === id);
    const to = at + dir;
    if (at === -1 || to < 0 || to >= cached.length) return;
    const next = [...cached];
    const [agent] = next.splice(at, 1);
    next.splice(to, 0, agent!);
    cached = next;
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
  },
};

/* Standing orders belong to a book; a different book has different ones. */
store.onVaultReplaced(() => {
  loadedFor = undefined;
  cached = [];
  emit();
});

export function useAgents(): Agent[] {
  useSyncExternalStore(agentStore.subscribe, agentStore.getVersion, agentStore.getVersion);
  return agentStore.all();
}
