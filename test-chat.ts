/* Assertions for the chat panel's pure half.

   Same shape as test-tabs.ts and test-roles.ts: silent when everything
   holds, a non-zero exit when it doesn't.

   The point of this file is that none of it needs a model. A chat is the
   easiest feature in an app to leave untested — you type at it, it says
   something plausible, you believe it works — and the parts that quietly
   ruin it are exactly the parts a human never checks: whether the fourth
   turn still carries the second one, whether a 200-entry codex is being
   sent every time somebody asks a yes/no question, whether the thread
   list survives a hand-edited store. All of that is data in, data out,
   so all of it is checkable here with no Ollama, no key, no network.

   One assertion in here is really a tripwire: buildChatRequest gets its
   world knowledge by cutting context.ts's system prompt at a known
   heading. If that heading is ever renamed, chat would silently stop
   knowing anything about anyone's book — no error, just worse answers.
   The seam is asserted so the rename breaks a test instead. */

import {
  DEFAULT_CHAT_ROLE,
  MAX_TURN_ENTRIES,
  NEW_THREAD_TITLE,
  WORLD_HEADING,
  buildChatRequest,
  entriesForTurn,
  knowsLine,
  mentions,
  newId,
  newThread,
  parseThreads,
  pruneThreads,
  removeThread,
  renderTranscript,
  sortThreads,
  titleFromFirstMessage,
  trimHistory,
  upsertThread,
  withMessage,
  withPatchedMessage,
  type ChatMessage,
  type ChatThread,
} from "./src/ai/chatCore";
import { ROLES } from "./src/ai/roles";
import type { Note } from "./src/core/vault";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/* ---------- fixtures ---------- */

function note(over: Partial<Note> & { title: string }): Note {
  return {
    id: over.id ?? over.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    path: over.path ?? `codex/${over.title}.md`,
    type: over.type ?? "character",
    title: over.title,
    aliases: over.aliases ?? [],
    tags: over.tags ?? [],
    data: over.data ?? {},
    body: over.body ?? "",
  };
}

const wren = note({
  title: "Wren Calloway",
  aliases: ["the cartographer"],
  body: "Wren maps coastlines nobody has asked her to map.",
});

const halden = note({
  title: "Halden's Reach",
  type: "location",
  aliases: ["The Reach"],
  body: "A harbour town built on the wrong side of a tidal shelf.",
});

const brine = note({ title: "Brine Guild", type: "faction", body: "They own the tide tables." });

const scene = note({
  title: "The Tide Turns",
  type: "chapter",
  path: "chapters/01.md",
  data: { pov: "[[Wren Calloway]]" },
  body: "She had counted the boats twice. The harbour said nothing back to her, and she was glad of it.",
});

const msg = (
  speaker: "writer" | "assistant",
  text: string,
  at = 0,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({ id: newId(), speaker, text, at, ...extra });

/* ---------- ids ---------- */

{
  const ids = new Set<string>();
  for (let i = 0; i < 5000; i++) ids.add(newId());
  check("ids: unique inside one session even in a tight loop", ids.size, 5000);
  ok("ids: carry their prefix", newId("t").startsWith("t-"));
}

/* ---------- the default role ---------- */

{
  ok(
    "role: chat's default is a role that actually exists",
    ROLES.some((r) => r.id === DEFAULT_CHAT_ROLE),
  );
}

/* ---------- titles from the first thing typed ---------- */

{
  check("title: nothing typed is still a name", titleFromFirstMessage(""), NEW_THREAD_TITLE);
  check("title: whitespace is nothing typed", titleFromFirstMessage("  \n\n  "), NEW_THREAD_TITLE);

  check(
    "title: a short question keeps its question mark",
    titleFromFirstMessage("Who is Wren Calloway?"),
    "Who is Wren Calloway?",
  );
  check(
    "title: a trailing full stop is dropped",
    titleFromFirstMessage("Fix this. Then tell me why it broke in the first place, please."),
    "Fix this",
  );
  check(
    "title: wiki links are read as their names",
    titleFromFirstMessage("Tell me about [[Wren Calloway]] and her brother."),
    "Tell me about Wren Calloway and her brother",
  );
  check(
    "title: markdown decoration doesn't reach the list",
    titleFromFirstMessage("## **Why** does the storm land here"),
    "Why does the storm land here",
  );
  check(
    "title: newlines collapse rather than truncating the name",
    titleFromFirstMessage("Two problems\nwith chapter four"),
    "Two problems with chapter four",
  );
  check(
    "title: a long opening is cut on a word, not through one",
    titleFromFirstMessage(
      "I need help figuring out whether the storm should hit before or after the confession scene.",
    ),
    "I need help figuring out whether the storm…",
  );
  check(
    "title: one enormous word is cut anyway rather than left whole",
    titleFromFirstMessage("a".repeat(60)),
    `${"a".repeat(48)}…`,
  );
  ok(
    "title: never longer than a narrow pane can show",
    titleFromFirstMessage("word ".repeat(80)).length <= 50,
  );
}

/* ---------- a thread taking messages ---------- */

{
  const t0 = newThread({ now: 100 });
  check("thread: starts unnamed", t0.title, NEW_THREAD_TITLE);
  check("thread: starts on the default role", t0.role, DEFAULT_CHAT_ROLE);
  check("thread: starts empty", t0.messages.length, 0);

  const t1 = withMessage(t0, msg("writer", "Does Halden's Reach have a harbour?", 200));
  check("thread: the first thing typed names it", t1.title, "Does Halden's Reach have a harbour?");
  check("thread: and the clock moves", t1.updatedAt, 200);
  ok("thread: the original is untouched", t0.messages.length === 0 && t0.title === NEW_THREAD_TITLE);

  const t2 = withMessage(t1, msg("assistant", "It has two.", 300));
  check("thread: an answer doesn't rename the conversation", t2.title, t1.title);

  const t3 = withMessage(t2, msg("writer", "And a lighthouse?", 400));
  check("thread: nor does a second question", t3.title, t1.title);
  check("thread: messages accumulate in order", t3.messages.map((m) => m.speaker), [
    "writer",
    "assistant",
    "writer",
  ]);

  // An assistant message arriving first (a thread opened by something
  // other than the writer) must not name the thread after the model.
  const auto = withMessage(newThread({ now: 1 }), msg("assistant", "Hello.", 2));
  check("thread: the model doesn't get to name the conversation", auto.title, NEW_THREAD_TITLE);
}

/* ---------- patching a streaming reply ---------- */

{
  const reply = msg("assistant", "", 10);
  const t = withMessage(withMessage(newThread({ now: 1 }), msg("writer", "Go on", 5)), reply);

  const mid = withPatchedMessage(t, reply.id, { text: "Two boat" });
  check("stream: the reply grows in place", mid.messages.length, 2);
  check("stream: with the new text", mid.messages[1]!.text, "Two boat");
  check("stream: and doesn't touch the question", mid.messages[0]!.text, "Go on");

  const done = withPatchedMessage(mid, reply.id, { text: "Two boats.", by: "Claude" }, 99);
  check("stream: the finished reply records who answered", done.messages[1]!.by, "Claude");
  check("stream: and only then moves the clock", done.updatedAt, 99);
  check("stream: an unfinished patch leaves the clock alone", mid.updatedAt, t.updatedAt);

  const ghost = withPatchedMessage(t, "not-a-message", { text: "boo" });
  check("stream: a patch for a message that isn't there changes nothing", ghost, t);
}

/* ---------- the thread list ---------- */

{
  const a: ChatThread = { ...newThread({ now: 1 }), id: "a", updatedAt: 10 };
  const b: ChatThread = { ...newThread({ now: 2 }), id: "b", updatedAt: 30 };
  const c: ChatThread = { ...newThread({ now: 3 }), id: "c", updatedAt: 20 };

  check("list: a new thread lands at the front", upsertThread([a, b], c).map((t) => t.id), [
    "c",
    "a",
    "b",
  ]);
  const replaced = upsertThread([a, b, c], { ...b, title: "renamed" });
  check("list: an existing thread stays where it sits", replaced.map((t) => t.id), ["a", "b", "c"]);
  check("list: and is the new version of itself", replaced[1]!.title, "renamed");
  check("list: removing one leaves the rest", removeThread([a, b, c], "b").map((t) => t.id), ["a", "c"]);
  check("list: newest conversation first", sortThreads([a, b, c]).map((t) => t.id), ["b", "c", "a"]);
  check(
    "list: ties keep the order they had, so nothing reshuffles for nothing",
    sortThreads([{ ...a, updatedAt: 5 }, { ...b, updatedAt: 5 }, { ...c, updatedAt: 5 }]).map((t) => t.id),
    ["a", "b", "c"],
  );
}

/* ---------- what gets written down ---------- */

{
  const spoken = (id: string, at: number, count: number): ChatThread => ({
    ...newThread({ now: at }),
    id,
    updatedAt: at,
    messages: Array.from({ length: count }, (_, i) => msg("writer", `line ${i}`, at + i)),
  });

  const empty = newThread({ now: 500 });
  const kept = pruneThreads([spoken("a", 10, 2), empty, spoken("b", 20, 2)]);
  check(
    "prune: an untouched New chat is not a conversation and isn't saved",
    kept.map((t) => t.id),
    ["b", "a"],
  );

  const many = Array.from({ length: 40 }, (_, i) => spoken(`t${i}`, i, 1));
  check("prune: the thread list has a ceiling", pruneThreads(many, 5).length, 5);
  check(
    "prune: and it's the recent ones that survive",
    pruneThreads(many, 3).map((t) => t.id),
    ["t39", "t38", "t37"],
  );

  const long = pruneThreads([spoken("x", 1, 20)], 10, 5);
  check("prune: an endless thread is trimmed", long[0]!.messages.length, 5);
  check(
    "prune: to its most recent turns, not its first",
    long[0]!.messages.map((m) => m.text),
    ["line 15", "line 16", "line 17", "line 18", "line 19"],
  );
}

/* ---------- reading a store that may be junk ---------- */

{
  check("parse: not an array is no threads", parseThreads({ threads: 1 }), []);
  check("parse: null is no threads", parseThreads(null), []);
  check("parse: garbage entries are skipped, not fatal", parseThreads([1, "x", null, {}]), []);

  const raw = [
    {
      id: "t1",
      title: "Harbour questions",
      role: "research",
      noteId: "chapter-one",
      createdAt: 5,
      updatedAt: 9,
      messages: [
        { id: "m1", speaker: "writer", text: "Why a tidal shelf?", at: 6, knows: ["Halden's Reach", 7] },
        { id: "m2", speaker: "assistant", text: "Because…", at: 7, by: "Claude" },
        { id: "m3", speaker: "assistant", text: "   ", at: 8 },
        { id: "m4", speaker: "assistant", text: "", at: 8, error: "Can't reach Claude." },
      ],
    },
    { id: "t1", title: "duplicate id" },
    { id: "t2", role: "not-a-role", messages: [] },
    { title: "no id at all" },
  ];
  const parsed = parseThreads(raw);

  check("parse: one thread per id, duplicates dropped", parsed.map((t) => t.id), ["t1", "t2"]);
  check("parse: a real role survives", parsed[0]!.role, "research");
  check("parse: a role that isn't one falls back", parsed[1]!.role, DEFAULT_CHAT_ROLE);
  check("parse: an untitled thread gets the placeholder", parsed[1]!.title, NEW_THREAD_TITLE);
  check(
    "parse: a message with neither words nor a reason is nothing",
    parsed[0]!.messages.map((m) => m.id),
    ["m1", "m2", "m4"],
  );
  check("parse: a failed turn is kept, because it happened", parsed[0]!.messages[2]!.error, "Can't reach Claude.");
  check("parse: non-string context names are dropped", parsed[0]!.messages[0]!.knows, ["Halden's Reach"]);
  check("parse: a missing clock doesn't produce NaN", parsed[1]!.updatedAt, 0);

  // The real round trip: what persist() writes is what load() reads.
  const original = withMessage(
    newThread({ role: "critique", noteId: "ch1", now: 1 }),
    msg("writer", "Does this land?", 2, { knows: ["Wren Calloway"] }),
  );
  const back = parseThreads(JSON.parse(JSON.stringify([original])))[0]!;
  check("parse: a round trip through JSON keeps the title", back.title, original.title);
  check("parse: keeps the role", back.role, original.role);
  check("parse: keeps the note it started from", back.noteId, original.noteId);
  check("parse: keeps what the turn knew", back.messages[0]!.knows, ["Wren Calloway"]);
}

/* ---------- naming things in a message ---------- */

{
  ok("mentions: a name in the sentence counts", mentions("What does Wren Calloway want?", wren));
  ok("mentions: case doesn't matter", mentions("what does wren calloway want", wren));
  ok("mentions: an alias counts too", mentions("Take me to The Reach", halden));
  ok("mentions: a wiki link is a mention", mentions("About [[Wren Calloway]]", wren));
  ok(
    "mentions: a piped wiki link is a mention of its target",
    mentions("About [[Halden's Reach|the town]]", halden),
  );
  ok(
    "mentions: an apostrophe in a name isn't a regex",
    mentions("Does Halden's Reach have a harbour?", halden),
  );
  ok(
    "mentions: half a name inside another word is not a mention",
    !mentions("She tightened the wrench", note({ title: "Wren" })),
  );
  ok(
    "mentions: nor is a name that only appears as a suffix",
    !mentions("He reached for it", note({ title: "Reach" })),
  );
}

/* ---------- which entries a turn carries ---------- */

{
  const candidates = [wren, halden, brine];

  check(
    "turn: the scene's own references come along",
    entriesForTurn("what now?", [wren, halden], candidates).map((n) => n.title),
    ["Wren Calloway", "Halden's Reach"],
  );
  check(
    "turn: a name they just typed comes along even if the scene never links it",
    entriesForTurn("Is the Brine Guild lying?", [], candidates).map((n) => n.title),
    ["Brine Guild"],
  );
  check(
    "turn: what they asked about outranks what the scene mentions",
    entriesForTurn("Is the Brine Guild lying?", [wren, halden], candidates, 2).map((n) => n.title),
    ["Brine Guild", "Wren Calloway"],
  );
  check(
    "turn: an entry named twice is still carried once",
    entriesForTurn("Wren Calloway, the cartographer", [wren], candidates).map((n) => n.title),
    ["Wren Calloway"],
  );

  const chapter = note({ title: "Chapter Two", type: "chapter", body: "x".repeat(5000) });
  check(
    "turn: chapters are never carried — their titles anchor continuity, their bodies are the bill",
    entriesForTurn("What happens in Chapter Two?", [chapter], [chapter, ...candidates]).length,
    0,
  );

  const crowd = Array.from({ length: 30 }, (_, i) => note({ title: `Extra ${i}` }));
  check(
    "turn: a scene that references thirty things still sends a handful",
    entriesForTurn("go on", crowd, crowd).length,
    MAX_TURN_ENTRIES,
  );
  check("turn: a limit of nothing sends nothing", entriesForTurn("go on", crowd, crowd, 0).length, 0);
}

/* ---------- the honest line ---------- */

{
  check("knows: nothing sent says nothing", knowsLine([]), "");
  check(
    "knows: the line the owner asked for",
    knowsLine([wren, halden]),
    "knows about: Wren Calloway, Halden's Reach",
  );
  check(
    "knows: a long list is counted rather than run off the pane",
    knowsLine([wren, halden, brine, note({ title: "D" }), note({ title: "E" })]),
    "knows about: Wren Calloway, Halden's Reach, Brine Guild, D +1 more",
  );
}

/* ---------- what the model is told the conversation was ---------- */

{
  const bare = renderTranscript([], "Why a tidal shelf?");
  check("transcript: a first message needs no preamble", bare, "Writer: Why a tidal shelf?\n\nYou:");

  const with2 = renderTranscript(
    [msg("writer", "Why a tidal shelf?", 1), msg("assistant", "Because the harbour drains.", 2)],
    "And the guild?",
  );
  ok("transcript: earlier turns are labelled", with2.includes("## The conversation so far"));
  ok("transcript: the writer is the writer", with2.includes("Writer: Why a tidal shelf?"));
  ok("transcript: the model is spoken to as you", with2.includes("You: Because the harbour drains."));
  ok("transcript: the new message is last", with2.trimEnd().endsWith("Writer: And the guild?\n\nYou:"));
}

/* ---------- what falls off the top ---------- */

{
  // Forty characters is ten tokens by context.ts's own reckoning, which
  // is what makes these budgets readable rather than magic.
  const forty = (n: number): string => `${n}`.padEnd(40, ".");
  const history = [
    msg("writer", forty(1), 1),
    msg("assistant", forty(2), 2),
    msg("writer", forty(3), 3),
    msg("assistant", forty(4), 4),
  ];

  check("trim: a generous budget keeps everything", trimHistory(history, 1000).length, 4);
  check(
    "trim: a tight budget keeps the recent end",
    trimHistory(history, 25).map((m) => m.text),
    [forty(3), forty(4)],
  );
  check(
    "trim: an answer whose question fell off the top goes with it",
    trimHistory(history, 35).map((m) => m.text),
    [forty(3), forty(4)],
  );
  check(
    "trim: empty turns never travel",
    trimHistory([msg("writer", "   ", 1), msg("writer", "real", 2)], 1000).length,
    1,
  );

  const huge = [msg("writer", "x".repeat(8000), 1)];
  check(
    "trim: the thing they just said survives even when it alone blows the budget",
    trimHistory(huge, 10).length,
    1,
  );
  check("trim: nothing in, nothing out", trimHistory([], 100), []);
}

/* ---------- the request itself ---------- */

{
  const req = buildChatRequest({
    scene,
    entries: [wren, halden],
    history: [msg("writer", "Why a tidal shelf?", 1), msg("assistant", "It drains.", 2)],
    message: "And the guild?",
  });

  ok("request: the codex block is still where context.ts puts it", req.system.includes(WORLD_HEADING));
  ok("request: an entry's facts actually travel", req.system.includes("Wren maps coastlines"));
  ok("request: so does the second one", req.system.includes("tidal shelf"));
  ok(
    "request: the drafting orders do NOT travel — this is a conversation",
    !req.system.includes("Write only the prose that comes next"),
  );
  ok(
    "request: but the scene's point of view does, for when prose is asked for",
    req.system.includes("Wren Calloway's point of view"),
  );

  ok("request: the open scene's prose is on the page", req.prompt.includes("counted the boats twice"));
  ok("request: the scene is named", req.prompt.includes("The Tide Turns"));
  ok("request: the conversation is carried", req.prompt.includes("Writer: Why a tidal shelf?"));
  ok("request: the new message is the last word", req.prompt.trimEnd().endsWith("You:"));

  check("request: it reports what it actually sent", req.entries.map((n) => n.title), [
    "Wren Calloway",
    "Halden's Reach",
  ]);
  ok("request: and can say what that cost", req.estimatedTokens > 0);

  // The rule this whole design exists to keep.
  const bible = Array.from({ length: 200 }, (_, i) =>
    note({ title: `Unmentioned ${i}`, body: `secret fact number ${i}` }),
  );
  const cheap = buildChatRequest({
    scene,
    entries: entriesForTurn("Does this scene work?", [], bible),
    history: [],
    message: "Does this scene work?",
  });
  ok(
    "economy: a 200-entry world that this turn never names costs nothing",
    !cheap.system.includes("secret fact number"),
  );
  check("economy: and reports carrying nothing", cheap.entries.length, 0);
  ok(
    "economy: which is cheaper than the same question with the world attached",
    cheap.estimatedTokens < req.estimatedTokens,
  );

  // A chapter handed in by mistake must not smuggle its body through.
  const withChapter = buildChatRequest({
    scene,
    entries: [note({ title: "Chapter Nine", type: "chapter", body: "smuggled prose" })],
    history: [],
    message: "hm",
  });
  ok("request: a chapter's body never rides along", !withChapter.system.includes("smuggled prose"));
  check("request: and isn't claimed as context either", withChapter.entries.length, 0);
}

/* ---------- with nothing open ---------- */

{
  const req = buildChatRequest({ scene: undefined, entries: [], history: [], message: "Name a harbour town" });
  check(
    "no note: the prompt is the conversation and nothing else",
    req.prompt,
    renderTranscript([], "Name a harbour town"),
  );
  ok("no note: no phantom scene is invented", !req.prompt.includes("## Scene:"));
  ok("no note: the panel still has its instructions", req.system.includes("collaborator on this novel"));

  const named = buildChatRequest({
    scene: undefined,
    entries: entriesForTurn("Tell me about [[Wren Calloway]]", [], [wren, halden]),
    history: [],
    message: "Tell me about [[Wren Calloway]]",
  });
  ok(
    "no note: a name they typed still reaches the model with nothing open",
    named.system.includes("Wren maps coastlines"),
  );
  check("no note: and is reported", named.entries.map((n) => n.title), ["Wren Calloway"]);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`chat tests: ${checks} checks passed`);
