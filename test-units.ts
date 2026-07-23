/* Assertion tests for the pure logic.

   test.ts is a guided tour of the vault engine — it prints, it doesn't
   assert. This file is the opposite: no output unless something is wrong,
   non-zero exit when it is. Both run in `npm run verify`.

   Only genuinely pure functions live here. Anything needing a DOM, a
   filesystem, or a live model is verified in the browser instead. */

import { thin, type Revision } from "./src/state/history";
import { diffParagraphs, relativeTime } from "./src/ui/diff";
import { acceptsTemperature } from "./src/ai/models";
import { parseNote, serializeNote, extractWikiLinks } from "./src/core/vault";
import {
  chapterFilename,
  chapterToMarkdown,
  splitIntoChapters,
  textToParagraphs,
} from "./src/import/manuscript";
import { extractEntities } from "./src/import/entities";
import { computeStreak } from "./src/state/sessions";
import { assembleColumns, threadColor, PALETTE } from "./src/state/plot";
import { extractTasks, toggleTaskAt, taskProgress } from "./src/core/tasks";
import { parseMusicUrl, MUSIC_PRESETS } from "./src/state/music";
import { weekOf } from "./src/state/planner";
import { agentIsDue } from "./src/state/agents";
import { compareVersions } from "./src/state/updates";
import { defaultBanner } from "./src/seed/bannerArt";
import { ARC_PER_LABEL, clipLabel, LABEL_MAX_CHARS, ringPositions, webCanvasSize } from "./src/ui/webLayout";

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

/* ---------- revision thinning ---------- */

const rev = (at: number, body = `body-${at}`): Revision => ({
  at,
  body,
  reason: "test",
  words: 1,
});

{
  const few = [rev(1), rev(2), rev(3)];
  check("thin: under the cap is untouched", thin(few, 100).length, 3);

  // 200 revisions spread over 40 days, thinned as of "now".
  const now = 40 * 86_400_000;
  const many = Array.from({ length: 200 }, (_, i) => rev(Math.round((i + 1) * (now / 200))));
  const thinned = thin(many, now);

  ok("thin: caps the list", thinned.length <= 60);
  ok("thin: keeps something", thinned.length > 5);
  check("thin: keeps the oldest", thinned[0]!.at, many[0]!.at);
  check("thin: keeps the newest", thinned[thinned.length - 1]!.at, many[many.length - 1]!.at);
  ok(
    "thin: stays in chronological order",
    thinned.every((r, i) => i === 0 || r.at > thinned[i - 1]!.at),
  );
  ok("thin: no duplicates", new Set(thinned.map((r) => r.at)).size === thinned.length);

  // Recent work is what a writer reaches for, so it should survive
  // more densely than month-old drafts.
  const lastHour = thinned.filter((r) => now - r.at < 3_600_000).length;
  const olderThanAWeek = thinned.filter((r) => now - r.at > 7 * 86_400_000).length;
  ok("thin: keeps recent revisions densely", lastHour >= 1);
  ok("thin: thins old revisions harder", olderThanAWeek < many.length / 2);
}

/* ---------- paragraph diff ---------- */

{
  const same = diffParagraphs("One.\n\nTwo.", "One.\n\nTwo.");
  check("diff: identical text has no changes", same.filter((r) => r.kind !== "same").length, 0);

  const added = diffParagraphs("One.", "One.\n\nTwo.");
  check("diff: appended paragraph is an add", added.map((r) => r.kind), ["same", "add"]);

  const removed = diffParagraphs("One.\n\nTwo.", "One.");
  check("diff: deleted paragraph is a remove", removed.map((r) => r.kind), ["same", "remove"]);

  const replaced = diffParagraphs("Old opening.", "New opening.");
  check("diff: rewrite is remove + add", replaced.map((r) => r.kind), ["remove", "add"]);
  check("diff: remove carries the old text", replaced[0]!.text, "Old opening.");
  check("diff: add carries the new text", replaced[1]!.text, "New opening.");

  // A middle insertion must not desync the paragraphs after it.
  const middle = diffParagraphs("A\n\nC", "A\n\nB\n\nC");
  check("diff: middle insertion keeps surroundings aligned", middle.map((r) => r.kind), [
    "same",
    "add",
    "same",
  ]);

  check("diff: empty to empty", diffParagraphs("", "").length, 0);
  check("diff: empty to content is all adds", diffParagraphs("", "New.").map((r) => r.kind), ["add"]);
}

/* ---------- relative time ---------- */

{
  const now = 1_000_000_000_000;
  check("time: seconds reads as just now", relativeTime(now - 5_000, now), "just now");
  check("time: minutes", relativeTime(now - 5 * 60_000, now), "5 minutes ago");
  check("time: singular minute", relativeTime(now - 60_000, now), "1 minute ago");
  check("time: hours", relativeTime(now - 3 * 3_600_000, now), "3 hours ago");
  check("time: days", relativeTime(now - 3 * 86_400_000, now), "3 days ago");
  ok("time: never renders a negative age", !relativeTime(now + 60_000, now).includes("-"));
}

/* ---------- model sampling guard ---------- */

/* Getting this wrong is a hard 400 from the API rather than a soft
   degradation, which is why it's worth a test rather than a comment. */
{
  ok("models: opus 4.8 rejects temperature", !acceptsTemperature("claude-opus-4-8"));
  ok("models: fable 5 rejects temperature", !acceptsTemperature("claude-fable-5"));
  ok("models: sonnet 5 rejects temperature", !acceptsTemperature("claude-sonnet-5"));
  ok("models: opus 4.6 still accepts temperature", acceptsTemperature("claude-opus-4-6"));
  ok("models: haiku 4.5 still accepts temperature", acceptsTemperature("claude-haiku-4-5"));
  // The guard is Claude-specific and fails closed, so anything it doesn't
  // recognise — including OpenAI ids — is treated as rejecting.
  ok("models: unknown ids fail closed", !acceptsTemperature("some-model-we-never-heard-of"));
  ok("models: non-Claude ids fail closed", !acceptsTemperature("gpt-4o"));
}

/* ---------- vault round-trip ---------- */

{
  const raw = `---\ntype: chapter\nname: A Test\norder: 3\n---\nProse with [[A Link]] in it.`;
  const note = parseNote("Manuscript/a-test.md", raw);
  check("vault: title from frontmatter", note.title, "A Test");
  check("vault: order preserved as a number", note.data.order, 3);

  const round = parseNote("Manuscript/a-test.md", serializeNote(note));
  check("vault: body survives a round-trip", round.body, note.body);
  check("vault: order survives a round-trip", round.data.order, 3);

  check("vault: extracts links", extractWikiLinks("see [[One]] and [[Two|alias]]"), ["One", "Two"]);
  check("vault: ignores malformed links", extractWikiLinks("[[]] [[ok]]"), ["ok"]);
}

/* ---------- manuscript splitting ---------- */

{
  const para = (text: string, style = "normal", centered = false) => ({ text, style, centered });

  const styled = splitIntoChapters([
    para("Chapter One", "heading1"),
    para("The fog came in."),
    para("She waited."),
    para("Chapter Two", "heading1"),
    para("Morning, and no fog at all."),
  ]);
  check("import: splits on heading styles", styled.length, 2);
  check("import: keeps the heading as the title", styled[0]!.title, "Chapter One");
  check("import: collects the prose beneath", styled[0]!.body, "The fog came in.\n\nShe waited.");
  check("import: numbers chapters in order", styled.map((c) => c.order), [1, 2]);

  // The common real-world case: no styles at all, just centered text.
  const centered = splitIntoChapters([
    para("CHAPTER ONE", "normal", true),
    para("It began badly."),
    para("CHAPTER TWO", "normal", true),
    para("It got worse."),
  ]);
  check("import: splits on centered chapter markers", centered.length, 2);

  // Scene breaks must survive as prose, not become chapters.
  const scenes = splitIntoChapters([
    para("Chapter One", "heading1"),
    para("Before."),
    para("* * *"),
    para("After."),
  ]);
  check("import: scene breaks do not split chapters", scenes.length, 1);
  ok("import: scene break kept in the prose", scenes[0]!.body.includes("* * *"));

  // Nothing recognizable: one file beats a wrong guess.
  const flat = splitIntoChapters([para("Just some prose."), para("And more of it.")]);
  check("import: unrecognized structure yields one chapter", flat.length, 1);
  check("import: names the fallback honestly", flat[0]!.title, "Imported manuscript");

  check("import: empty input yields nothing", splitIntoChapters([]).length, 0);

  // Markdown route.
  const md = textToParagraphs("# Chapter One\n\nThe fog came in.\n\n## Chapter Two\n\nIt cleared.");
  check("import: markdown headings become headings", md[0]!.style, "heading1");
  const fromMd = splitIntoChapters(md);
  check("import: markdown splits into chapters", fromMd.length, 2);
  check("import: markdown chapter title", fromMd[1]!.title, "Chapter Two");

  // The first line being a chapter heading is the common plain-text shape.
  const firstLineHeading = splitIntoChapters(textToParagraphs("Chapter One\n\nIt began."));
  check("import: detects a heading on the very first line", firstLineHeading.length, 1);
  check("import: first-line heading becomes the title", firstLineHeading[0]!.title, "Chapter One");

  // Emphasis on a heading is presentation, not part of the title.
  const boldTitle = splitIntoChapters([
    para("**Chapter One**", "heading1"),
    para("Prose."),
  ]);
  check("import: strips bold markers from titles", boldTitle[0]!.title, "Chapter One");

  // Front matter before the first heading is not chapter one.
  const withFront = splitIntoChapters([
    para("A Novel", "normal", true),
    para("by Someone", "normal", true),
    para("Chapter One", "heading1"),
    para("It began."),
  ]);
  check("import: front matter is labelled honestly", withFront[0]!.title, "Front matter");
  check("import: real chapter follows the front matter", withFront[1]!.title, "Chapter One");

  // A trailing empty heading is a deliberate outline stub, not noise.
  const trailingStub = splitIntoChapters([
    para("Chapter One", "heading1"),
    para("Done."),
    para("Chapter Two", "heading1"),
  ]);
  check("import: keeps a trailing empty chapter", trailingStub.length, 2);
  check("import: trailing stub has an empty body", trailingStub[1]!.body, "");

  check(
    "import: filename carries the order",
    chapterFilename({ title: "The Compass That Lies", body: "", order: 3 }),
    "Manuscript/03-The-Compass-That-Lies.md",
  );
  ok(
    "import: markdown output round-trips through the vault parser",
    parseNote("Manuscript/01-x.md", chapterToMarkdown({ title: "A: Title", body: "Prose.", order: 1 }))
      .title === "A: Title",
  );
}

/* ---------- codex extraction ---------- */

{
  const prose = `
The fog folded over Halden's Reach like a hand closing around a coin.
Wren pressed her thumb to the compass her mother left her. She had not
slept. "You should go back," said Wren, and the Archivist only shook
his head. The Archivist had been keeping the Sunken Library for longer
than anyone in Halden's Reach could remember. Wren followed him into
the dark. She thought about the compass. It lied, and it had always
lied, and Wren had known that since she was nine.
`;

  const found = extractEntities(prose);
  const names = found.map((e) => e.name);

  ok("entities: finds a repeated character", names.includes("Wren"));
  ok("entities: finds a multi-word place", names.includes("Halden's Reach"));

  // The whole point: common words that only ever start sentences are noise.
  ok("entities: rejects 'The'", !names.includes("The"));
  ok("entities: rejects 'She'", !names.includes("She"));
  ok("entities: rejects 'It'", !names.includes("It"));
  ok("entities: rejects 'You'", !names.includes("You"));

  const wren = found.find((e) => e.name === "Wren")!;
  check("entities: dialogue tag marks a character", wren.guess, "character");
  ok("entities: counts every mention", wren.count >= 4);
  ok("entities: carries evidence", wren.evidence.length > 0);

  const reach = found.find((e) => e.name === "Halden's Reach")!;
  check("entities: place suffix marks a location", reach.guess, "location");

  // Names the vault already knows must not be proposed again.
  const filtered = extractEntities(prose, ["Wren"]);
  ok("entities: skips names already in the codex", !filtered.map((e) => e.name).includes("Wren"));

  // Already-linked names are prose the app wrote, not discoveries.
  const linked = extractEntities("A meeting at [[Halden's Reach]] with [[Wren]] and Wren again.");
  ok("entities: ignores existing wiki-links", !linked.map((e) => e.name).includes("Halden's Reach"));

  // A title is stripped from the name, so the match index has to move with
  // it or every downstream slice reads the wrong window of prose.
  const titled = extractEntities(
    'Doctor Halloway rose. "Sit," said Doctor Halloway, and she sat.',
    [],
    { minCount: 2 },
  );
  const halloway = titled.find((e) => e.name === "Halloway");
  ok("entities: strips titles from names", halloway !== undefined);
  check("entities: title still marks a character", halloway?.guess, "character");
  ok("entities: evidence lines up with the name", halloway!.evidence.includes("Halloway"));

  // A capitalized phrase must not weld across a paragraph break, or a
  // chapter heading swallows the first name under it.
  const glued = extractEntities(
    "Chapter Four\n\nMira Vance had not been home in years. Mira waited.",
  );
  const gluedNames = glued.map((e) => e.name);
  ok("entities: does not glue across a blank line", !gluedNames.some((n) => n.startsWith("Chapter")));
  ok("entities: finds the name under a heading", gluedNames.includes("Mira Vance"));

  // Hard-wrapped manuscripts break names across a single newline.
  const wrapped = extractEntities("They waited for Mira\nVance to speak. Mira Vance did not.");
  ok("entities: still spans a single newline", wrapped.map((e) => e.name).includes("Mira Vance"));

  // One character, several names — the vault resolves via aliases, so the
  // full name should win and the short form ride along.
  const merged = extractEntities(
    'Elias Thorne opened the gate. "You came," said Elias. Elias shrugged again.',
  );
  const elias = merged.find((e) => e.name === "Elias Thorne");
  ok("entities: merges a short form into the full name", elias !== undefined);
  check("entities: short form becomes an alias", elias?.aliases, ["Elias"]);
  check("entities: merged count covers both forms", elias?.count, 3);
  ok("entities: the short form is not listed twice", !merged.map((e) => e.name).includes("Elias"));

  // Ambiguous merges must be left alone rather than guessed.
  const shared = extractEntities(
    "Elias Thorne spoke. Mira Thorne did not. Nobody had seen Thorne since. They asked Thorne twice.",
  );
  ok(
    "entities: ambiguous short forms are not merged",
    shared.map((e) => e.name).includes("Thorne"),
  );

  ok(
    "entities: structural headings are never entities",
    !extractEntities("Chapter Four\n\nChapter Four\n\nPart Two").map((e) => e.name).length,
  );

  check("entities: empty text finds nothing", extractEntities("").length, 0);
  check(
    "entities: prose with no names finds nothing",
    extractEntities("the fog came in and it did not leave for three days.").length,
    0,
  );
}

/* ---------- writing streaks ---------- */

{
  const day = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const ago = (n: number, from: Date) => {
    const d = new Date(from);
    d.setDate(d.getDate() - n);
    return d;
  };
  const now = new Date("2026-07-21T15:00:00");
  const rec = (d: Date, words: number) => ({ day: day(d), words, baseline: 0 });

  // Three days in a row including today, goal 500.
  const streak3: Record<string, ReturnType<typeof rec>> = {};
  for (const n of [0, 1, 2]) {
    const r = rec(ago(n, now), 600);
    streak3[r.day] = r;
  }
  check("streak: counts consecutive met days", computeStreak(streak3, 500, now), 3);

  // Today not written yet, but yesterday and before were — streak holds.
  const notYetToday: Record<string, ReturnType<typeof rec>> = {};
  for (const n of [1, 2, 3]) {
    const r = rec(ago(n, now), 600);
    notYetToday[r.day] = r;
  }
  check("streak: unfinished today doesn't break it", computeStreak(notYetToday, 500, now), 3);

  // A gap two days back ends the streak there.
  const gap: Record<string, ReturnType<typeof rec>> = {};
  for (const n of [0, 1, 3, 4]) {
    const r = rec(ago(n, now), 600);
    gap[r.day] = r;
  }
  check("streak: a missed day ends it", computeStreak(gap, 500, now), 2);

  // Under-goal days don't count when a goal is set.
  const under: Record<string, ReturnType<typeof rec>> = {};
  for (const n of [0, 1, 2]) {
    const r = rec(ago(n, now), 100);
    under[r.day] = r;
  }
  check("streak: below-goal days don't count", computeStreak(under, 500, now), 0);

  // With no goal, any positive day counts; a zero day doesn't.
  check("streak: no goal counts any writing", computeStreak(streak3, 0, now), 3);
  check("streak: empty history is a zero streak", computeStreak({}, 500, now), 0);

  // An editing day (negative net) never counts toward a streak.
  const editing: Record<string, ReturnType<typeof rec>> = {};
  const e = rec(now, -300);
  editing[e.day] = e;
  check("streak: a net-negative day doesn't count", computeStreak(editing, 0, now), 0);
}

/* ---------- task lists ---------- */

{
  const body = [
    "Some prose first.",
    "- [ ] chart the headland",
    "- [x] ask the archivist",
    "* [X] star marker, capital X",
    "3. [ ] numbered task",
    "-[ ] no space after marker — not a task",
    "- [y] wrong char — not a task",
    "  - [ ] indented is fine",
    "and - [ ] mid-line is not a task",
  ].join("\n");

  const tasks = extractTasks(body);
  check("tasks: finds every real task", tasks.length, 5);
  check(
    "tasks: reads done state",
    tasks.map((t) => t.done),
    [false, true, true, false, false],
  );
  check("tasks: strips markers from text", tasks[0]!.text, "chart the headland");

  // Offsets must point at the "[" exactly, or toggling would corrupt prose.
  for (const t of tasks) {
    ok(`tasks: checkbox offset lands on "[" for "${t.text}"`, body[t.checkbox] === "[");
  }

  const toggled = toggleTaskAt(body, tasks[0]!.checkbox)!;
  ok("tasks: toggle open -> done", extractTasks(toggled)[0]!.done);
  const back = toggleTaskAt(toggled, tasks[0]!.checkbox)!;
  check("tasks: toggle round-trips", back, body);
  check("tasks: toggling a non-checkbox offset refuses", toggleTaskAt(body, 0), null);

  check("tasks: progress counts", taskProgress(body), { done: 2, total: 5 });
  check("tasks: empty body has no tasks", extractTasks("").length, 0);
  check("tasks: prose-only body has no tasks", taskProgress("Just words here."), {
    done: 0,
    total: 0,
  });
}

/* ---------- plot grid columns ---------- */

{
  const t = (id: string, name: string, color: number) => ({ id, name, color });

  // Stored threads keep their order and definitions.
  const stored = [t("mystery", "Mystery", 0), t("romance", "Romance", 3)];
  const cols = assembleColumns(stored, ["mystery", "romance"]);
  check("plot: stored threads pass through in order", cols.map((c) => c.id), ["mystery", "romance"]);
  check("plot: stored names are kept", cols[0]!.name, "Mystery");
  check("plot: stored colours are kept", cols[1]!.color, 3);

  // A thread id present only in the content is recovered as a column.
  const recovered = assembleColumns(stored, ["mystery", "romance", "betrayal_arc"]);
  check("plot: recovers threads found only in content", recovered.length, 3);
  check("plot: recovered column keeps its id", recovered[2]!.id, "betrayal_arc");
  check("plot: recovered name is prettified", recovered[2]!.name, "Betrayal Arc");

  // Stored order always wins over content order.
  const reordered = assembleColumns([t("romance", "Romance", 3), t("mystery", "Mystery", 0)], [
    "mystery",
    "romance",
  ]);
  check("plot: stored order beats content order", reordered.map((c) => c.id), ["romance", "mystery"]);

  // No duplication when a thread is both stored and in use.
  const both = assembleColumns([t("mystery", "Mystery", 0)], ["mystery", "mystery"]);
  check("plot: no duplicate columns", both.length, 1);

  check("plot: empty everything is empty", assembleColumns([], []).length, 0);
  check(
    "plot: pure content with no config still yields columns",
    assembleColumns([], ["thread-a", "thread-b"]).map((c) => c.name),
    ["Thread A", "Thread B"],
  );

  // Colour wraps rather than indexing out of the palette.
  check("plot: colour index wraps into the palette", threadColor(PALETTE.length + 1), PALETTE[1]);
  check("plot: negative colour index is handled", threadColor(-1), PALETTE[PALETTE.length - 1]);
}

/* ---------- music url parsing ---------- */

{
  const spotify = parseMusicUrl("https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ?si=abc");
  check("music: spotify playlist → embed", spotify?.embedUrl, "https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ");
  check("music: spotify kind", spotify?.kind, "spotify");

  const track = parseMusicUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
  ok("music: spotify track gets the compact player", (track?.height ?? 0) < 200);

  check(
    "music: youtube watch → nocookie embed",
    parseMusicUrl("https://www.youtube.com/watch?v=jfKfPfyJRdk")?.embedUrl,
    "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk",
  );
  check(
    "music: youtube playlist → videoseries",
    parseMusicUrl("https://www.youtube.com/playlist?list=PL123abc")?.embedUrl,
    "https://www.youtube-nocookie.com/embed/videoseries?list=PL123abc",
  );
  check(
    "music: youtu.be short link",
    parseMusicUrl("https://youtu.be/jfKfPfyJRdk")?.embedUrl,
    "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk",
  );
  check(
    "music: music.youtube.com works too",
    parseMusicUrl("https://music.youtube.com/watch?v=abc123")?.embedUrl,
    "https://www.youtube-nocookie.com/embed/abc123",
  );
  ok(
    "music: soundcloud wraps the whole url",
    parseMusicUrl("https://soundcloud.com/artist/track")!.embedUrl.includes(
      encodeURIComponent("https://soundcloud.com/artist/track"),
    ),
  );
  check(
    "music: apple music host swap",
    parseMusicUrl("https://music.apple.com/us/playlist/x/pl.abc")?.embedUrl,
    "https://embed.music.apple.com/us/playlist/x/pl.abc",
  );

  check("music: garbage is rejected", parseMusicUrl("not a url"), null);
  check("music: unknown hosts are rejected", parseMusicUrl("https://example.com/song"), null);
  check("music: bare spotify home is rejected", parseMusicUrl("https://open.spotify.com/"), null);
  // Every curated preset must actually parse, or a preset button would
  // silently do nothing.
  for (const preset of MUSIC_PRESETS) {
    ok(`music: preset "${preset.name}" parses`, parseMusicUrl(preset.url) !== null);
  }
}

/* ---------- planner week math ---------- */

{
  // 2026-07-22 is a Wednesday.
  const wed = new Date("2026-07-22T15:00:00");
  const week = weekOf(wed);
  check("planner: a week is seven days", week.length, 7);
  check("planner: week starts on Monday", week[0]!.date.getDay(), 1);
  check("planner: monday is the 20th", week[0]!.day, "2026-07-20");
  check("planner: sunday is the 26th", week[6]!.day, "2026-07-26");
  ok("planner: the anchor day is inside its own week", week.some((d) => d.day === "2026-07-22"));

  // A Sunday anchor must not slide into next week.
  const sun = new Date("2026-07-26T09:00:00");
  check("planner: sunday still belongs to its week", weekOf(sun)[0]!.day, "2026-07-20");
}

/* ---------- agent triggers ---------- */

{
  const base = {
    id: "a1",
    name: "Test",
    instructions: "x",
    scope: "manuscript" as const,
    enabled: true,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
  };
  const NOW = new Date("2026-07-22T15:00:00").getTime();
  const HOUR = 3_600_000;

  ok(
    "agents: manual never fires on its own",
    !agentIsDue({ ...base, trigger: { kind: "manual" } }, "app-open", NOW) &&
      !agentIsDue({ ...base, trigger: { kind: "manual" } }, "tick", NOW),
  );
  ok(
    "agents: app-open fires on open only",
    agentIsDue({ ...base, trigger: { kind: "app-open" } }, "app-open", NOW) &&
      !agentIsDue({ ...base, trigger: { kind: "app-open" } }, "tick", NOW),
  );
  ok(
    "agents: daily fires when never run",
    agentIsDue({ ...base, trigger: { kind: "daily" } }, "tick", NOW),
  );
  ok(
    "agents: daily rests after running today",
    !agentIsDue({ ...base, trigger: { kind: "daily" }, lastRunAt: NOW - HOUR }, "tick", NOW),
  );
  ok(
    "agents: daily wakes on a new day",
    agentIsDue({ ...base, trigger: { kind: "daily" }, lastRunAt: NOW - 26 * HOUR }, "tick", NOW),
  );
  ok(
    "agents: on-save respects the cooldown",
    !agentIsDue(
      { ...base, trigger: { kind: "on-save", cooldownMinutes: 30 }, lastRunAt: NOW - 10 * 60_000 },
      "save",
      NOW,
    ) &&
      agentIsDue(
        { ...base, trigger: { kind: "on-save", cooldownMinutes: 30 }, lastRunAt: NOW - 31 * 60_000 },
        "save",
        NOW,
      ),
  );
  ok(
    "agents: on-save ignores ticks",
    !agentIsDue({ ...base, trigger: { kind: "on-save", cooldownMinutes: 30 } }, "tick", NOW),
  );
  ok(
    "agents: interval fires when elapsed",
    agentIsDue(
      { ...base, trigger: { kind: "interval", minutes: 30 }, lastRunAt: NOW - 31 * 60_000 },
      "tick",
      NOW,
    ) &&
      !agentIsDue(
        { ...base, trigger: { kind: "interval", minutes: 30 }, lastRunAt: NOW - 5 * 60_000 },
        "tick",
        NOW,
      ),
  );
  ok(
    "agents: disabled agents never fire",
    !agentIsDue({ ...base, enabled: false, trigger: { kind: "daily" } }, "app-open", NOW),
  );
}

/* ---------- version compare ---------- */

{
  check("updates: equal versions", compareVersions("1.2.3", "1.2.3"), 0);
  check("updates: newer patch wins", compareVersions("1.2.3", "1.2.4"), -1);
  check("updates: 1.2.10 beats 1.2.9 numerically", compareVersions("1.2.10", "1.2.9"), 1);
  check("updates: leading v is ignored", compareVersions("v1.2.3", "1.2.3"), 0);
  check("updates: missing segments count as zero", compareVersions("1.2", "1.2.0"), 0);
  check("updates: major beats everything", compareVersions("2.0.0", "1.9.9"), 1);
}

/* ---------- default banner art ---------- */

{
  const a1 = defaultBanner("Ashcroft Hollow");
  const a2 = defaultBanner("Ashcroft Hollow");
  const b = defaultBanner("River Test");
  ok("banner: is an inline SVG data url", a1.startsWith("data:image/svg+xml"));
  check("banner: deterministic for a name", a1, a2);
  ok("banner: different names get different art", a1 !== b);
  ok("banner: case and spacing don't change the art", defaultBanner("  ASHCROFT hollow ") === a1);
  ok("banner: empty name still yields art", defaultBanner("").startsWith("data:image/svg+xml"));
}

/* ---------- relationship web layout ---------- */

/* The single-ring version put 44 entries on one circle and a quarter of the
   labels collided. These lock in the multi-ring rule that replaced it. */
{
  check("web: nothing to place", ringPositions(0).length, 0);
  check("web: places exactly what it's asked to", ringPositions(44).length, 44);
  check("web: a tiny bible stays on one ring", new Set(ringPositions(6).map((p) => p.ring)).size, 1);

  const big = ringPositions(44);
  ok("web: a big bible spreads over several rings", new Set(big.map((p) => p.ring)).size >= 2);
  ok("web: labels alternate above and below", big.some((p) => p.below) && big.some((p) => !p.below));

  // The real defect: neighbouring labels overlapping. Approximate a label as
  // a box at the node and assert no two collide.
  const collisions = (n: number): number => {
    const pts = ringPositions(n).map((p) => ({
      x: p.x,
      y: p.y + (p.below ? 15 : -12),
      w: ARC_PER_LABEL,
      h: 15,
    }));
    let hits = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]!;
        const b = pts[j]!;
        if (
          Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
          Math.abs(a.y - b.y) < (a.h + b.h) / 2
        ) {
          hits++;
        }
      }
    }
    return hits;
  };
  check("web: 20 entries never collide", collisions(20), 0);
  check("web: 44 entries never collide", collisions(44), 0);
  check("web: 80 entries never collide", collisions(80), 0);

  // Everything must land inside the drawing box, or nodes clip off-canvas.
  // The box grows with the cast, so it's asked for rather than assumed.
  for (const n of [6, 44, 80, 200]) {
    const box = webCanvasSize(n);
    ok(
      `web: all ${n} nodes stay inside the ${box}px canvas`,
      ringPositions(n).every((p) => p.x > 30 && p.x < box - 30 && p.y > 30 && p.y < box - 30),
    );
  }
  ok("web: the canvas grows with the cast", webCanvasSize(200) > webCanvasSize(20));
  check("web: 200 entries never collide", collisions(200), 0);

  // Labels are clipped so one operatic name can't set the spacing for the
  // whole map — and the arc budget must actually cover a clipped label.
  check("web: short names pass through", clipLabel("Wren"), "Wren");
  ok(
    "web: long names are clipped",
    clipLabel("Archmagister Corvane the Undying").length <= LABEL_MAX_CHARS,
  );
  ok(
    "web: clipped names show an ellipsis",
    clipLabel("Archmagister Corvane the Undying").endsWith("…"),
  );
  ok("web: the arc budget covers a full-width label", ARC_PER_LABEL >= LABEL_MAX_CHARS * 7);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`unit tests: ${checks} checks passed`);
