import { buildSceneContext, estimateTokens, povDirective, stripWikiLinks } from "./context";
import { DEFAULT_ROLE, isRoleId, type RoleId } from "./roles";
import type { Note } from "../core/vault";

/* ============================================================
   Chat — the half that can be proved without a machine.

   The Assistant tab asks one question and gets one answer; close it and
   the exchange is gone. That is the right shape for "continue this
   scene" and the wrong shape for "who would Wren lie to, and why" —
   a question whose answer is only useful because of the four questions
   before it. So chat is a different thing, not a longer Assistant, and
   the things that make it a conversation live here: what a thread is,
   what falls out of it when the context window fills, which codex
   entries a single turn is worth paying for, and what the thread ends
   up called.

   Everything in this file is data in, data out. No network, no
   localStorage, no React — test-chat.ts runs it on a machine with no
   Ollama, no keys and no browser, which is the only way rules about
   trimming and titling ever get checked at all.

   The one thing it does NOT do is assemble scene context. context.ts
   already knows how to format a codex entry, how much of a chapter is
   worth sending, and how to name the point of view; a second assembler
   here would drift from it within a month and start sending the whole
   bible again. So buildChatRequest hands the work to buildSceneContext
   and only supplies what a conversation needs that a draft doesn't.
   ============================================================ */

/* ---------------- shape ---------------- */

export type Speaker = "writer" | "assistant";

export interface ChatMessage {
  id: string;
  speaker: Speaker;
  text: string;
  /** Epoch ms. Also what the thread sorts by, via the thread's updatedAt. */
  at: number;
  /** Titles of the codex entries this turn actually carried. Recorded on
      the writer's turn rather than computed later, because "what did it
      know when it said that?" is a question about the past. */
  knows?: string[];
  /** Which connection answered — "Claude", "Local (Ollama)". A reply whose
      author is a mystery is a reply you can't calibrate. Absent when a
      fallback fired, because then `note` is the one that names the truth. */
  by?: string;
  /** The sentence generate.ts hands back when one connection stood in for
      another. Not an error — a substitution the writer is owed. */
  note?: string;
  /** What went wrong, in the words the writer should see. A failed turn
      stays in the thread; deleting it would make the app look like it
      never tried. */
  error?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  /** Which job this thread is — and therefore which connection answers.
      Per thread rather than per panel: a research thread and a drafting
      thread are different conversations and deserve different models. */
  role: RoleId;
  /** The note that was open when it started, so re-opening a thread can
      say what it was about even if you're somewhere else now. */
  noteId?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/* ---------------- the numbers, and why they are these numbers ---------------- */

/** Chat starts on the same role as everything else that doesn't say
    otherwise. Not because chat is drafting, but because Drafting is the
    connection a writer has certainly set up — the owner asking for "a
    chat that connects to Claude" meant their main model, not whichever
    one a cleverer default picked for them. The role selector is in the
    header; a thread that should be Research is one click from being it. */
export const DEFAULT_CHAT_ROLE: RoleId = DEFAULT_ROLE;

/** How many codex entries one turn may carry. The token-economy rule
    from context.ts, applied to a surface that fires far more often than
    the Assistant does: a chat is twenty requests where a draft is one,
    so the per-request bill is twenty times as interesting. */
export const MAX_TURN_ENTRIES = 6;

/** Roughly how much of the back-and-forth rides along with each turn.
    Deliberately modest — the scene and the codex are the expensive part
    and the part that actually grounds an answer, and a chat that quietly
    resends forty exchanges is how a local model runs out of window
    mid-sentence and a paid one runs up a bill nobody agreed to. */
export const HISTORY_TOKEN_BUDGET = 1200;

/** What one reply is allowed to be. Long enough for a scene beat, short
    enough that a runaway model stops on its own. */
export const MAX_REPLY_TOKENS = 700;

/** Threads and messages kept on disk. localStorage is a few megabytes
    shared with every other preference in the app; a chat log that grows
    without limit eventually takes the whole store down with it. */
export const MAX_THREADS = 30;
export const MAX_MESSAGES = 120;

export const NEW_THREAD_TITLE = "New chat";
const MAX_TITLE_CHARS = 48;

/* ---------------- ids ---------------- */

let counter = 0;

/** Unique within a session, which is all these ever have to be — they
    are never shown, never stored anywhere that outlives the store, and
    never compared across machines. Date.now() alone collides when two
    messages land in the same millisecond, which streaming does. */
export function newId(prefix = "m"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/* ---------------- threads ---------------- */

export function newThread(
  opts: { role?: RoleId; noteId?: string; now?: number } = {},
): ChatThread {
  const now = opts.now ?? Date.now();
  return {
    id: newId("t"),
    title: NEW_THREAD_TITLE,
    role: opts.role ?? DEFAULT_CHAT_ROLE,
    noteId: opts.noteId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** A thread's name, taken from what the writer opened with.

    Asking someone to name a conversation before they've had it is the
    kind of small tax that makes a feature go unused, and "New chat (4)"
    in a list of nine is no better. The first thing they typed is what
    the thread was about, so it is what the thread is called — trimmed to
    something that fits a narrow pane, cut on a word rather than through
    one, and keeping a question mark because "Who is Wren Calloway" and
    "Who is Wren Calloway?" are not the same line in a list. */
export function titleFromFirstMessage(text: string): string {
  const flat = stripWikiLinks(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return NEW_THREAD_TITLE;

  // A first sentence is a better name than a first line — but only when
  // it is short enough to read as a name rather than as prose.
  const sentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  const base = sentence.length <= MAX_TITLE_CHARS ? sentence : flat;
  const tidy = (s: string): string => s.replace(/[.,;:\s]+$/, "");

  if (base.length <= MAX_TITLE_CHARS) return tidy(base) || NEW_THREAD_TITLE;

  const cut = base.slice(0, MAX_TITLE_CHARS);
  const space = cut.lastIndexOf(" ");
  // Only respect the word boundary if it leaves a usable amount of title;
  // one very long word shouldn't collapse the name to two characters.
  const stem = tidy(space > MAX_TITLE_CHARS / 2 ? cut.slice(0, space) : cut);
  return stem ? `${stem}…` : NEW_THREAD_TITLE;
}

export function withMessage(thread: ChatThread, msg: ChatMessage): ChatThread {
  const named =
    thread.title === NEW_THREAD_TITLE && msg.speaker === "writer"
      ? titleFromFirstMessage(msg.text)
      : thread.title;
  return {
    ...thread,
    title: named,
    messages: [...thread.messages, msg],
    updatedAt: Math.max(thread.updatedAt, msg.at),
  };
}

/** Streaming writes the same message over and over, so this replaces one
    message in place rather than appending. Unknown ids are a no-op: a
    reply whose thread the writer deleted mid-stream must not resurrect
    it. */
export function withPatchedMessage(
  thread: ChatThread,
  id: string,
  patch: Partial<Omit<ChatMessage, "id">>,
  at?: number,
): ChatThread {
  const i = thread.messages.findIndex((m) => m.id === id);
  if (i === -1) return thread;
  const messages = thread.messages.slice();
  messages[i] = { ...messages[i]!, ...patch };
  return { ...thread, messages, updatedAt: at ?? thread.updatedAt };
}

export function upsertThread(threads: ChatThread[], thread: ChatThread): ChatThread[] {
  const i = threads.findIndex((t) => t.id === thread.id);
  if (i === -1) return [thread, ...threads];
  const next = threads.slice();
  next[i] = thread;
  return next;
}

export function removeThread(threads: ChatThread[], id: string): ChatThread[] {
  return threads.filter((t) => t.id !== id);
}

/** Most recently spoken to, first. The order the list is always shown in.
    Ties keep their existing order so a list never reshuffles for nothing. */
export function sortThreads(threads: ChatThread[]): ChatThread[] {
  return threads
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.updatedAt - a.t.updatedAt || a.i - b.i)
    .map((x) => x.t);
}

/** What is worth writing down. Empty threads are dropped outright — an
    untouched "New chat" is a panel that was opened, not a conversation
    that happened, and the store makes a fresh one on demand anyway.
    Returns newest-first; storage order is nobody's business but this. */
export function pruneThreads(
  threads: ChatThread[],
  maxThreads = MAX_THREADS,
  maxMessages = MAX_MESSAGES,
): ChatThread[] {
  return sortThreads(threads)
    .filter((t) => t.messages.length > 0)
    .slice(0, maxThreads)
    .map((t) =>
      t.messages.length <= maxMessages ? t : { ...t, messages: t.messages.slice(-maxMessages) },
    );
}

/* ---------------- reading it back off disk ---------------- */

/* Anything that has been through JSON and a file the writer could have
   opened in a text editor has to be treated as hostile. A half-written
   thread must not take the panel down with it — it must simply not be
   one of the threads. */

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const id = typeof m.id === "string" && m.id ? m.id : newId();
    const speaker: Speaker = m.speaker === "assistant" ? "assistant" : "writer";
    const text = typeof m.text === "string" ? m.text : "";
    const error = typeof m.error === "string" && m.error ? m.error : undefined;
    // A message with neither words nor a reason is nothing at all.
    if (!text.trim() && !error) continue;
    out.push({
      id,
      speaker,
      text,
      at: typeof m.at === "number" && Number.isFinite(m.at) ? m.at : 0,
      knows: Array.isArray(m.knows) ? m.knows.filter((k): k is string => typeof k === "string") : undefined,
      by: typeof m.by === "string" ? m.by : undefined,
      note: typeof m.note === "string" && m.note ? m.note : undefined,
      error,
    });
  }
  return out;
}

export function parseThreads(raw: unknown): ChatThread[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatThread[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const createdAt = typeof t.createdAt === "number" && Number.isFinite(t.createdAt) ? t.createdAt : 0;
    const title = typeof t.title === "string" && t.title.trim() ? t.title : NEW_THREAD_TITLE;
    out.push({
      id,
      title,
      // A role that no longer exists (renamed, or hand-edited) falls back
      // rather than stranding the thread on a role nothing can resolve.
      role: isRoleId(t.role) ? t.role : DEFAULT_CHAT_ROLE,
      noteId: typeof t.noteId === "string" ? t.noteId : undefined,
      messages: parseMessages(t.messages),
      createdAt,
      updatedAt:
        typeof t.updatedAt === "number" && Number.isFinite(t.updatedAt) ? t.updatedAt : createdAt,
    });
  }
  return out;
}

/* ---------------- which codex entries a turn carries ---------------- */

const RX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/* The panel re-checks every name in the codex on every keystroke, to keep
   the "knows about" line honest while the writer is still typing. Compiling
   four hundred regexes that often is the only part of that which costs
   anything, and the set of names barely changes — so it is cached, bounded
   by the size of the vault. */
const rxCache = new Map<string, RegExp | null>();

/** A name matched as a whole word, so "Wren" doesn't fire on "wrench"
    and "Reach" doesn't fire on "reached". One-character names are
    skipped: there is no way to tell an initial from an article. */
function boundaryRx(name: string): RegExp | null {
  const clean = name.trim();
  const hit = rxCache.get(clean);
  if (hit !== undefined) return hit;
  const rx =
    clean.length < 2
      ? null
      : new RegExp(
          `(?<![\\p{L}\\p{N}])${clean.replace(RX_SPECIAL, "\\$&")}(?![\\p{L}\\p{N}])`,
          "iu",
        );
  rxCache.set(clean, rx);
  return rx;
}

const WIKI = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/** The target halves of any [[…]] in the text.

    stripWikiLinks keeps the display alias when a link is piped, which is
    right for prose and wrong here: [[Halden's Reach|the town]] is the
    writer pointing straight at an entry, and it would be perverse for
    the one unambiguous way to name something to be the way that doesn't
    count. */
function linkedNames(text: string): string[] {
  return [...text.matchAll(WIKI)]
    .map((m) => (m[1] ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/** Does this text name that note — by title or by any alias it answers to? */
export function mentions(text: string, note: Pick<Note, "title" | "aliases">): boolean {
  const flat = stripWikiLinks(text);
  const linked = linkedNames(text);
  for (const name of [note.title, ...note.aliases]) {
    const clean = name.trim().toLowerCase();
    if (clean && linked.includes(clean)) return true;
    const rx = boundaryRx(name);
    if (rx?.test(flat)) return true;
  }
  return false;
}

/** The codex entries this one turn should pay for.

    Two sources, in this order on purpose. What the writer just typed the
    name of is the strongest signal there is about what the turn is
    about — they asked about Wren, so Wren goes even if the open scene
    has never heard of her. What the open scene references comes second:
    background rather than subject. Chapters never go; their titles are
    continuity anchors, not facts, and sending a whole one is the exact
    bill this rule exists to prevent.

    Capped, because a scene that references thirty entries would
    otherwise turn every "does this line work?" into a full-bible
    request. */
export function entriesForTurn(
  text: string,
  sceneReferenced: Note[],
  candidates: Note[] = [],
  limit = MAX_TURN_ENTRIES,
): Note[] {
  const out: Note[] = [];
  const push = (n: Note): void => {
    if (n.type === "chapter") return;
    if (out.some((o) => o.id === n.id)) return;
    out.push(n);
  };
  for (const n of candidates) if (mentions(text, n)) push(n);
  for (const n of sceneReferenced) push(n);
  return out.slice(0, Math.max(0, limit));
}

/** "knows about: Wren Calloway, Halden's Reach" — the whole honesty
    budget of this panel in one line. Invisible context is how a writer
    stops believing the answers; a line they can read and disagree with
    is how they keep believing them. Empty when nothing went, which is
    itself worth showing. */
export function knowsLine(entries: { title: string }[], max = 4): string {
  if (entries.length === 0) return "";
  const names = entries.slice(0, max).map((e) => e.title);
  const more = entries.length - names.length;
  return `knows about: ${names.join(", ")}${more > 0 ? ` +${more} more` : ""}`;
}

/* ---------------- the conversation itself ---------------- */

/** As much of the back-and-forth as the budget allows, most recent kept.

    The last message always survives even when it alone blows the budget —
    dropping the thing the writer just typed would send an empty turn and
    look like a bug. And the oldest kept message is never an assistant
    one: an answer whose question fell off the top reads to the model as
    a claim the writer made, which is how chats start arguing with
    themselves. */
export function trimHistory(
  messages: ChatMessage[],
  budget = HISTORY_TOKEN_BUDGET,
): ChatMessage[] {
  const usable = messages.filter((m) => m.text.trim().length > 0);
  const kept: ChatMessage[] = [];
  let spent = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    const m = usable[i]!;
    const cost = estimateTokens(m.text);
    if (kept.length > 0 && spent + cost > budget) break;
    spent += cost;
    kept.unshift(m);
  }
  while (kept.length > 0 && kept[0]!.speaker === "assistant") kept.shift();
  return kept;
}

/** The transcript as the model reads it. "Writer" and "You" rather than
    "user" and "assistant" because these models were trained on the words
    people use, and the trailing "You:" is what stops a completion-shaped
    model from writing the writer's next line for them. */
export function renderTranscript(history: ChatMessage[], next: string): string {
  const lines = history
    .filter((m) => m.text.trim())
    .map((m) => `${m.speaker === "writer" ? "Writer" : "You"}: ${m.text.trim()}`);
  const head = lines.length ? `## The conversation so far\n\n${lines.join("\n\n")}\n\n---\n\n` : "";
  return `${head}Writer: ${next.trim()}\n\nYou:`;
}

/** The heading context.ts writes above the codex block.

    Chat needs the world half of that system prompt and must not have the
    "write only prose, no commentary" half, so it cuts at this marker. A
    seam, and seams rot quietly — test-chat.ts asserts that a request
    built with entries actually contains it, so a rename in context.ts
    breaks a test instead of silently emptying every chat of its world. */
export const WORLD_HEADING = "## World details relevant to this scene";

export function worldBlock(system: string): string {
  const at = system.indexOf(WORLD_HEADING);
  return at === -1 ? "" : system.slice(at).trim();
}

/** The scene's declared point-of-view character, if it declares one. */
export function povNameOf(scene: Note): string | undefined {
  const raw = scene.data.pov;
  if (typeof raw !== "string") return undefined;
  return stripWikiLinks(raw).trim() || undefined;
}

const CHAT_SYSTEM = [
  "You are the writer's collaborator on this novel. You are talking with them — answering questions, arguing, suggesting — not silently writing their book.",
  "Answer the question actually asked, concretely and briefly. Say plainly when you don't know something rather than inventing it.",
  "You can see the open scene and the world details below, and nothing else of their manuscript. If you need something you can't see, ask for it.",
  "Never state an invention about their world as though it were already true. Offer it as a suggestion.",
  "When they ask for manuscript prose, give the prose alone — no preamble, no explanation — so it can go straight into the chapter.",
].join("\n");

export interface ChatTurn {
  /** The note open right now, or nothing — chat works either way. */
  scene?: Note;
  /** Already chosen by entriesForTurn. */
  entries: Note[];
  /** Already trimmed by trimHistory. */
  history: ChatMessage[];
  message: string;
}

export interface ChatRequest {
  system: string;
  prompt: string;
  /** What actually went, after context.ts had its say. This is the list
      the panel shows — not the list we hoped to send. */
  entries: Note[];
  estimatedTokens: number;
}

/* With nothing open there is no scene to send, but a writer can still
   ask about [[Wren Calloway]] and expect an answer about her. Rather
   than grow a second assembler for that case, context.ts is handed an
   empty stand-in: it formats the codex entries exactly as it would for a
   real scene, and the prompt simply carries no prose. */
const NO_SCENE: Note = {
  id: "__novella-chat-no-scene__",
  path: "",
  type: "note",
  title: "(nothing open)",
  aliases: [],
  tags: [],
  data: {},
  body: "",
};

export function buildChatRequest(turn: ChatTurn): ChatRequest {
  const convo = renderTranscript(turn.history, turn.message);
  const scene = turn.scene ?? NO_SCENE;

  // The conversation rides in as the instruction, which puts it exactly
  // where buildSceneContext puts "Continue this scene." — after the prose
  // tail, under the rule. One assembler, two jobs.
  const ctx = buildSceneContext(scene, turn.entries, { instruction: convo });

  const pov = turn.scene ? povDirective(turn.scene, povNameOf(turn.scene)) : "";
  const system = [
    CHAT_SYSTEM,
    pov ? `If you are asked for manuscript prose: ${pov}` : "",
    worldBlock(ctx.system),
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = turn.scene ? ctx.prompt : convo;

  return {
    system,
    prompt,
    entries: ctx.referenced,
    estimatedTokens: estimateTokens(system) + estimateTokens(prompt),
  };
}
