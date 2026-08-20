import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { generate, providerAvailable, whoAnswers } from "../ai/generate";
import { connections, ready, useConnections } from "../plugins/providers/connections";
import { ROLES, describeChain, noConnectionMessage, type RoleId } from "../ai/roles";
import { insertIntoEditor } from "./editorBridge";
import {
  DEFAULT_CHAT_ROLE,
  MAX_REPLY_TOKENS,
  NEW_THREAD_TITLE,
  buildChatRequest,
  entriesForTurn,
  knowsLine,
  newId,
  newThread,
  parseThreads,
  pruneThreads,
  removeThread,
  sortThreads,
  trimHistory,
  upsertThread,
  withMessage,
  withPatchedMessage,
  type ChatMessage,
  type ChatRequest,
  type ChatThread,
} from "../ai/chatCore";
import type { Note } from "../core/vault";

/* ============================================================
   Chat.

   The Assistant tab is one question and one answer, which is right for
   "continue this scene" and useless for the way writers actually work a
   problem — four questions deep, each one only sensible because of the
   three before it. This is that: a thread that remembers, per project,
   across restarts, bound to the page you have open.

   Three things it refuses to do, all for the same reason:

   It never inserts anything on its own. Every reply has an Insert button
   and nothing happens until it's pressed, because the one thing a
   writing app must never do is put words in the manuscript that the
   author didn't ask for.

   It never hides what it sent. The line above the box names the codex
   entries riding along with the next turn, and every turn keeps the list
   it went out with. Context you can't see is context you can't trust,
   and a writer who stops trusting the answers stops using the panel.

   It never spins forever. No connection, an unreachable one, a stopped
   stream — each produces the real sentence and the way out of it.

   The rules worth arguing about (what a thread is, what falls off the
   top when the window fills, which entries a turn carries, what the
   thread ends up called) are in ai/chatCore.ts, where they can be
   checked without a model running. This file is the surface: state,
   storage, and buttons.
   ============================================================ */

/* ---------------- the store ---------------- */

/* Threads live in localStorage, keyed by project, and deliberately NOT in
   the vault. The vault is the writer's book — a folder they open in
   Finder, sync, and hand to an editor — and a chat log is not part of
   their book. Writing one in there would put .novella/chat.json next to
   their chapters forever, and there is no version of "you asked the AI
   about a plot hole" that belongs in a manuscript folder.

   The cost of that choice, stated plainly: threads are tied to this
   machine and this browser profile. Move the project folder to another
   computer and the chapters travel; the chat doesn't. That is the right
   trade for a scratchpad and the wrong one for prose, which is exactly
   why prose goes through Insert and into a real file. */

const KEY_PREFIX = "novella.chat.";

interface Saved {
  v: number;
  threads: ChatThread[];
  activeId: string | null;
}

function storageKey(): string {
  return `${KEY_PREFIX}${store.vaultRoot() ?? "app"}`;
}

let threads: ChatThread[] = [];
let activeId: string | null = null;
/** Which project's threads are in memory. `undefined` = never loaded. */
let loadedFor: string | null | undefined;
/** The role a thread will be born with, when none exists to carry one. */
let pendingRole: RoleId = DEFAULT_CHAT_ROLE;
let busyId: string | null = null;
let abort: AbortController | null = null;
let version = 0;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function emit(): void {
  version++;
  for (const l of listeners) l();
}

/* Deliberately silent — this runs during render when a project has just
   been swapped, and a store that notified from inside a render would
   make React re-enter it. Nothing is lost: the render that triggered the
   load is the render that reads the result. */
function load(): void {
  loadedFor = store.vaultRoot();
  threads = [];
  activeId = null;
  pendingRole = DEFAULT_CHAT_ROLE;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Saved> | null;
    threads = sortThreads(parseThreads(saved?.threads));
    const wanted = typeof saved?.activeId === "string" ? saved.activeId : null;
    activeId = threads.some((t) => t.id === wanted) ? wanted : (threads[0]?.id ?? null);
    pendingRole = threads.find((t) => t.id === activeId)?.role ?? DEFAULT_CHAT_ROLE;
  } catch {
    // A hand-edited or truncated store costs the writer their history,
    // not their app. Starting empty is the only safe reading of junk.
    threads = [];
    activeId = null;
  }
}

function persist(): void {
  const keep = pruneThreads(threads);
  const payload: Saved = {
    v: 1,
    threads: keep,
    activeId: keep.some((t) => t.id === activeId) ? activeId : (keep[0]?.id ?? null),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(payload));
  } catch {
    // Quota, or a browser with storage switched off. The conversation on
    // screen still works; it just won't outlive the session, and saying
    // so in a banner would interrupt the writer to report something they
    // can't act on.
  }
}

const chat = {
  ensure(): void {
    if (loadedFor !== store.vaultRoot()) load();
  },
  all(): ChatThread[] {
    return threads;
  },
  active(): ChatThread | undefined {
    return threads.find((t) => t.id === activeId);
  },
  /** The role the next turn will use, whether or not a thread exists yet. */
  role(): RoleId {
    return this.active()?.role ?? pendingRole;
  },
  /* One answer at a time, app-wide. Two streams would share the single
     abort controller, which means the second one to start orphans the
     first: still writing into its thread, no longer stoppable by
     anything. A disabled Send that says which conversation is busy is
     the smaller cost. */
  runningId(): string | null {
    return busyId;
  },

  /** The thread to speak into, made on the spot if there isn't one. Never
      called during render — an empty "New chat" that nobody typed into is
      not worth creating, let alone saving. */
  open(): ChatThread {
    const found = this.active();
    if (found) return found;
    const made = newThread({ role: pendingRole, noteId: store.activeIdOrUndefined() });
    threads = [made, ...threads];
    activeId = made.id;
    emit();
    return made;
  },

  start(): void {
    // An untouched blank thread is reused rather than stacked on: two
    // "New chat" rows in the list would be a bug you have to clean up.
    const found = this.active();
    if (found && found.messages.length === 0) return;
    const made = newThread({ role: pendingRole, noteId: store.activeIdOrUndefined() });
    threads = [made, ...threads.filter((t) => t.messages.length > 0)];
    activeId = made.id;
    emit();
    persist();
  },

  select(id: string): void {
    activeId = id;
    pendingRole = this.active()?.role ?? pendingRole;
    // Selecting away from an untouched blank thread throws it away.
    threads = threads.filter((t) => t.id === id || t.messages.length > 0);
    emit();
    persist();
  },

  remove(id: string): void {
    if (busyId === id) abort?.abort();
    threads = removeThread(threads, id);
    if (activeId === id) activeId = threads[0]?.id ?? null;
    emit();
    persist();
  },

  setRole(role: RoleId): void {
    pendingRole = role;
    const found = this.active();
    if (found) threads = upsertThread(threads, { ...found, role });
    emit();
    persist();
  },

  add(threadId: string, msg: ChatMessage): void {
    const found = threads.find((t) => t.id === threadId);
    if (!found) return;
    threads = upsertThread(threads, withMessage(found, msg));
    emit();
    persist();
  },

  /** Used once per streamed chunk, so it deliberately does not persist —
      writing the whole store to localStorage on every token would stall
      the panel. runTurn saves when the answer is done. */
  patch(threadId: string, id: string, p: Partial<Omit<ChatMessage, "id">>, at?: number): void {
    const found = threads.find((t) => t.id === threadId);
    if (!found) return;
    threads = upsertThread(threads, withPatchedMessage(found, id, p, at));
    emit();
  },

  stop(): void {
    abort?.abort();
  },
};

/** Run one turn. Lives outside the component on purpose: a writer who
    switches to the Calendar while an answer streams should come back to
    a finished answer, not a truncated one. */
async function runTurn(threadId: string, req: ChatRequest, role: RoleId, replyId: string): Promise<void> {
  const controller = new AbortController();
  abort = controller;
  busyId = threadId;
  emit();

  const intended = whoAnswers(role).chain[0]?.label;
  let got = "";
  let fellBack = false;

  try {
    await generate(
      {
        system: req.system,
        prompt: req.prompt,
        maxTokens: MAX_REPLY_TOKENS,
        role,
        onFallback: (note) => {
          fellBack = true;
          chat.patch(threadId, replyId, { note });
        },
      },
      (chunk) => {
        got += chunk;
        chat.patch(threadId, replyId, { text: got });
      },
      controller.signal,
    );
    // When a substitution happened the note names who actually answered,
    // and claiming the intended one here would be the silent swap the
    // whole fallback mechanism exists to prevent.
    chat.patch(threadId, replyId, { text: got, by: fellBack ? undefined : intended }, Date.now());
  } catch (err) {
    const stopped = (err as Error | undefined)?.name === "AbortError";
    chat.patch(
      threadId,
      replyId,
      stopped
        ? { text: got, error: got.trim() ? "Stopped — this answer is unfinished." : "Stopped." }
        : { text: got, error: err instanceof Error ? err.message : String(err) },
      Date.now(),
    );
  } finally {
    if (abort === controller) {
      abort = null;
      busyId = null;
    }
    emit();
    persist();
  }
}

/* ---------------- the panel ---------------- */

export function ChatPanel() {
  const vaultVersion = useVaultVersion();
  useConnections();
  useSyncExternalStore(subscribe, () => version, () => version);
  chat.ensure();

  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [showWhere, setShowWhere] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keys arrive from the OS keychain asynchronously; without this the
  // header would name the wrong connection for the first second of every
  // session, which is exactly the second a writer is looking at it.
  useEffect(() => {
    void ready();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent): void => {
      if (!headRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [menuOpen]);

  const thread = chat.active();
  const messages = thread?.messages ?? [];
  // The memo below reads the transcript without depending on its identity.
  messagesRef.current = messages;
  const role = chat.role();
  const running = chat.runningId();
  const busy = running !== null && running === thread?.id;
  const elsewhere = running !== null && running !== thread?.id ? chat.all().find((t) => t.id === running) : undefined;
  const resolved = whoAnswers(role);
  const canRun = providerAvailable();

  // Follow the stream only while the writer is already at the bottom.
  // Yanking them down mid-scroll while they read an earlier answer is the
  // rudest thing a chat log can do.
  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const onScroll = useCallback(() => {
    const el = logRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  /* What this turn would carry, recomputed as they type. The whole point
     of the line under the box is that it is true before they press send,
     not explained afterwards.

     Memoised on the length of the thread rather than on the messages
     themselves: streaming replaces that array once per token, and
     rebuilding the whole scene context that often would make the panel
     stutter on exactly the machines this app exists for. Nothing about
     the preview depends on the half-written answer anyway. */
  const scene = store.active();
  const historyKey = `${thread?.id ?? ""}:${messages.length}`;
  const { sceneRefs, candidates } = useMemo(
    () => ({
      sceneRefs: scene
        ? store
            .outgoingLinks(scene)
            .map((l) => l.note)
            .filter((n): n is Note => Boolean(n))
        : [],
      candidates: store.vault.all().filter((n) => n.type !== "chapter"),
    }),
    [scene, vaultVersion],
  );
  const preview = useMemo(
    () =>
      buildChatRequest({
        scene,
        entries: entriesForTurn(draft, sceneRefs, candidates),
        history: trimHistory(messagesRef.current),
        message: draft,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, scene, sceneRefs, candidates, historyKey],
  );
  const knows = knowsLine(preview.entries);

  const send = (): void => {
    const text = draft.trim();
    if (!text || running !== null) return;
    if (!canRun) {
      // Enter must not start a run that has nowhere to go — a thread whose
      // first turn is an error reads as the app being broken rather than
      // as nothing being connected yet.
      setBanner(noConnectionMessage(connections()));
      return;
    }
    setBanner(null);

    const target = chat.open();
    const entries = entriesForTurn(text, sceneRefs, candidates);
    const req = buildChatRequest({
      scene,
      entries,
      history: trimHistory(target.messages),
      message: text,
    });

    const now = Date.now();
    chat.add(target.id, {
      id: newId(),
      speaker: "writer",
      text,
      at: now,
      knows: req.entries.map((n) => n.title),
    });
    const replyId = newId();
    chat.add(target.id, { id: replyId, speaker: "assistant", text: "", at: now + 1 });
    setDraft("");
    stick.current = true;
    void runTurn(target.id, req, target.role, replyId);
  };

  const insert = (text: string): void => {
    if (!text.trim()) return;
    if (!insertIntoEditor(text.trim())) {
      setBanner("No chapter is open, so there is nowhere to insert this.");
      return;
    }
    setBanner(null);
  };

  const copy = (id: string, text: string): void => {
    const done = navigator.clipboard?.writeText(text);
    if (!done) {
      setBanner("This browser won't let the app reach the clipboard. Select the text and copy it.");
      return;
    }
    void done.then(
      () => {
        setCopied(id);
        window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
      },
      () => setBanner("The clipboard refused. Select the text and copy it."),
    );
  };

  /* Settings lives in App.tsx, which knows nothing about this panel. The
     event is the offer; if nothing accepts it the panel says where the
     button is instead, because a dead button is worse than a sentence. */
  const openConnections = (): void => {
    const ev = new CustomEvent("novella:open-settings", {
      detail: { tab: "connections" },
      cancelable: true,
    });
    window.dispatchEvent(ev);
    if (!ev.defaultPrevented) setShowWhere(true);
  };

  const list = sortThreads(chat.all());

  return (
    <div className="chat-panel">
      <div className="chat-head" ref={headRef}>
        <button
          className="btn-ghost chat-thread-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          title="Switch or delete a conversation"
        >
          <span className="chat-thread-name">{thread?.title ?? NEW_THREAD_TITLE}</span>
          <span className="picker-caret">▾</span>
        </button>

        <select
          className="select bare chat-role"
          value={role}
          aria-label="Which job this conversation is — it decides which connection answers"
          onChange={(e) => chat.setRole(e.target.value as RoleId)}
        >
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>

        <button
          className="icon-btn"
          onClick={() => {
            chat.start();
            setDraft("");
            setBanner(null);
          }}
          data-tip="Start a new conversation"
          aria-label="New conversation"
        >
          ＋
        </button>

        {menuOpen && (
          <div className="menu-pop chat-threads" role="menu">
            {list.length === 0 && <p className="hint chat-threads-empty">No conversations yet.</p>}
            {list.map((t) => (
              <div className="chat-thread-row" key={t.id}>
                <button
                  className={`menu-item ${t.id === activeId ? "on" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    chat.select(t.id);
                    setMenuOpen(false);
                  }}
                >
                  <span className="chat-thread-name">{t.title}</span>
                  <span className="count">{t.messages.length}</span>
                </button>
                <button
                  className="icon-btn"
                  data-tip="Delete this conversation"
                  aria-label={`Delete ${t.title}`}
                  onClick={() => chat.remove(t.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="hint chat-answers" title={resolved.reason}>
        {resolved.chain.length > 0
          ? `Answering: ${describeChain(resolved)}`
          : "Nothing connected can answer."}
      </p>

      <div className="chat-log" ref={logRef} onScroll={onScroll} role="log">
        {messages.length === 0 ? (
          <div className="empty-state">
            <span className="empty-glyph" aria-hidden>
              ❞
            </span>
            <p className="empty-line">
              Ask about the book. It can see the chapter you have open and the codex entries
              that chapter names — nothing else, and it will tell you which ones.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <Turn
              key={m.id}
              msg={m}
              streaming={busy && m.speaker === "assistant" && m === messages[messages.length - 1]}
              copied={copied === m.id}
              onInsert={() => insert(m.text)}
              onCopy={() => copy(m.id, m.text)}
            />
          ))
        )}
      </div>

      {banner && <div className="notice error-notice chat-banner">{banner}</div>}

      {!canRun && (
        <div className="notice error-notice chat-blocked">
          <p>{noConnectionMessage(connections())}</p>
          <div className="btn-row">
            <button className="btn-ghost" onClick={openConnections}>
              Open Settings → Connections
            </button>
          </div>
          {showWhere && (
            <p className="hint">
              Settings is the ⚙ in the title bar — or press Ctrl+K and type “settings”.
            </p>
          )}
        </div>
      )}

      <div className="chat-composer">
        <p className="hint chat-knows" data-tip="Exactly what travels with your next message">
          {knows || "knows about: nothing yet — mention a name, or open a chapter"}
          <span className="count">~{preview.estimatedTokens.toLocaleString()}t</span>
        </p>
        <textarea
          className="field-input chat-input"
          rows={3}
          value={draft}
          placeholder={
            scene
              ? `Ask about “${scene.title}” — Enter to send, Shift+Enter for a new line`
              : "Ask about the book — Enter to send, Shift+Enter for a new line"
          }
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="btn-row">
          {busy ? (
            <button className="btn-ghost" onClick={() => chat.stop()}>
              Stop
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={send}
              disabled={!draft.trim() || !canRun || running !== null}
            >
              Send
            </button>
          )}
          {busy && (
            <span className="hint">
              <span className="spinner" aria-hidden /> Thinking…
            </span>
          )}
          {elsewhere && (
            <span className="hint chat-elsewhere">
              <span className="spinner" aria-hidden /> Still answering in “{elsewhere.title}”
              <button className="btn-ghost" onClick={() => chat.stop()}>
                Stop
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Turn({
  msg,
  streaming,
  copied,
  onInsert,
  onCopy,
}: {
  msg: ChatMessage;
  streaming: boolean;
  copied: boolean;
  onInsert: () => void;
  onCopy: () => void;
}) {
  const mine = msg.speaker === "writer";
  // A reply that has neither words nor a reason is still on its way; an
  // empty bubble with a caret in it is the honest picture of that.
  const bare = !msg.text.trim() && !msg.error;

  return (
    <div className="chat-msg" data-from={msg.speaker}>
      <div className={streaming || bare ? "chat-bubble stream-caret" : "chat-bubble"}>
        {msg.text}
      </div>

      {mine && msg.knows && msg.knows.length > 0 && (
        <p className="hint chat-knows-said">{knowsLine(msg.knows.map((title) => ({ title })))}</p>
      )}
      {!mine && msg.by && <p className="hint chat-by">{msg.by}</p>}
      {msg.note && <p className="hint chat-note">{msg.note}</p>}
      {msg.error && <p className="hint chat-error">{msg.error}</p>}

      {!mine && !streaming && msg.text.trim() && (
        <div className="chat-actions">
          <button
            className="btn-ghost"
            onClick={onInsert}
            data-tip="Puts this at the cursor in the chapter. Nothing is inserted until you press it."
          >
            Insert
          </button>
          <button className="btn-ghost" onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
