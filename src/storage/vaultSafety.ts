/* ============================================================
   Keeping a vault safe inside somebody else's sync folder

   The headline storage story is "your book is plain Markdown in a
   folder you already have" — and for most writers that folder is
   inside Google Drive, Dropbox, iCloud or OneDrive. That is a
   feature, not an accident. It is also a second process with write
   access to the manuscript, and it does three things that plain
   local disk never does:

     1. It grabs files mid-write to upload them.
     2. It writes files back under us when another machine edited them.
     3. When it can't decide, it drops a second file beside the first
        with a mangled name and considers the matter closed.

   This module is the pure half of the answer to all three. Nothing
   here touches a filesystem, reads a clock, or knows what an adapter
   is — every function takes its inputs and returns a decision, which
   is what makes the rules provable in test-storage.ts instead of only
   provable by losing somebody's chapter.

   The impure halves live in tauriStorage.ts (temp-write + rename) and
   vaultStore.ts (the save-time check and the conflict queue).
   ============================================================ */

/* ------------------------------------------------------------
   Paths

   Vault paths are relative and forward-slashed by convention (see
   VaultFile in adapter.ts), but backslashes have leaked in from
   Windows callers before, so the splitter tolerates both and puts
   back whichever separator it found. Getting this wrong would put a
   temp file in the wrong directory, and a temp file in the wrong
   directory is a rename across folders — which is exactly the
   non-atomic operation this whole module exists to avoid.
   ------------------------------------------------------------ */

export interface SplitPath {
  /** Everything up to and including the separator, or "" at the root. */
  dir: string;
  /** The file name alone. */
  base: string;
}

export function splitPath(relPath: string): SplitPath {
  const cut = Math.max(relPath.lastIndexOf("/"), relPath.lastIndexOf("\\"));
  if (cut < 0) return { dir: "", base: relPath };
  return { dir: relPath.slice(0, cut + 1), base: relPath.slice(cut + 1) };
}

/** The extension including its dot, or "" — dotfiles have no extension. */
export function extensionOf(base: string): string {
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}

/** The file name with its extension removed. */
export function stemOf(base: string): string {
  const ext = extensionOf(base);
  return ext ? base.slice(0, -ext.length) : base;
}

/* ------------------------------------------------------------
   D1 — atomic writes: where the temp file goes

   The rule that matters: the temp file must be a SIBLING of the
   target. rename() is only atomic within one filesystem, and a temp
   dir elsewhere on the machine can be on a different volume — at
   which point rename silently degrades to copy-then-delete and we're
   back to half-written files.

   The name has two independent reasons to be invisible to the vault:

     • It starts with a dot. Every adapter's readAll skips dot-prefixed
       entries — tauriStorage `entry.name.startsWith(".")`, webStorage
       and memoryStorage `path.startsWith(".") || path.includes("/.")`.
     • It does not end in `.md`. The disk and IndexedDB adapters both
       require that suffix before a file counts as a note.

   Either one alone would do. Both, because a temp file surfacing in
   the codex as a phantom chapter is the kind of bug that erodes trust
   in the whole "it's just files" promise.

   The token exists because two Novella windows on the same vault (or
   the same window saving twice fast) would otherwise write the same
   temp path and one would truncate the other's buffer mid-flight.
   ------------------------------------------------------------ */

export const TEMP_MARKER = ".novella-tmp";

/** Sibling scratch path for `relPath`. Pure: the caller supplies the token. */
export function tempPathFor(relPath: string, token: string): string {
  const { dir, base } = splitPath(relPath);
  const clean = token.replace(/[^A-Za-z0-9]/g, "") || "0";
  return `${dir}.${base}${TEMP_MARKER}-${clean}`;
}

/** True for anything this module would have written as scratch.

    Deliberately loose about the token: a temp file left behind by a
    crashed older build must still be recognised, or it rides into the
    next backup zip as if it were content. */
const TEMP_RE = new RegExp(`\\${TEMP_MARKER}(-[A-Za-z0-9]*)?$`);

export function isTempPath(relPath: string): boolean {
  const { base } = splitPath(relPath);
  return base.startsWith(".") && TEMP_RE.test(base);
}

/* ------------------------------------------------------------
   D2 — the don't-clobber decision

   Everything the save path needs to know, as one function over three
   values: the mtime we had when we last saw this file, the mtime it
   has right now, and whether our copy actually differs from what we
   last saw.

   `null` for either mtime means "we don't know", and not-knowing
   always resolves to "write". That is the load-bearing choice in this
   file. A missing stat, a filesystem with no mtime, an adapter that
   has no concept of one — none of those are evidence that somebody
   else edited the file, and refusing to save on an absence of
   evidence would turn a hardening feature into a new way to lose
   work. Hardening is allowed to be paranoid about ORDER; it is not
   allowed to be paranoid about SAVING.

   Strictly greater-than, with no skew tolerance, because we re-stat
   after every one of our own writes and store that exact value. If
   the number moved, someone who is not us moved it.
   ------------------------------------------------------------ */

export type SaveVerdict = "write" | "reload" | "conflict";

export interface ClobberInput {
  /** mtime (epoch ms) when we last read or wrote this file; null if unknown. */
  ourMtime: number | null;
  /** mtime on disk right now; null when stat failed or the file is new. */
  diskMtime: number | null;
  /** Does our in-memory copy differ from the text we last saw on disk? */
  dirty: boolean;
}

/** Cheap half of the decision, so the expensive `dirty` comparison is
    only computed on the rare path where it can change the answer. */
export function diskChanged(ourMtime: number | null, diskMtime: number | null): boolean {
  if (ourMtime === null || diskMtime === null) return false;
  return diskMtime > ourMtime;
}

/** The whole rule in one place.

    write    — nothing moved under us, or we can't tell. Save normally.
    reload   — the file changed but we have no local edits worth keeping,
               so quietly adopt theirs. No dialog: interrupting a writer
               to tell them nothing was lost is its own small harm.
    conflict — the file changed AND we have edits. Refuse to write and
               let the writer choose. Never guess; nothing here is
               qualified to merge prose. */
export function decideWrite(input: ClobberInput): SaveVerdict {
  if (!diskChanged(input.ourMtime, input.diskMtime)) return "write";
  return input.dirty ? "conflict" : "reload";
}

/* ------------------------------------------------------------
   Keep both

   The third door out of a conflict. The disk copy stays exactly where
   it is — it keeps the canonical path, so every [[wiki link]] pointing
   at that note still resolves — and our version lands beside it under
   a name a human can read at a glance.

   The suffix is deliberately not one of the sync-client patterns
   below: a file we wrote on purpose must never be re-classified as
   junk by our own conflict detector on the next open.
   ------------------------------------------------------------ */

/** `Chapter 7.md` + "my version" -> `Chapter 7 (my version).md`, then
    `(my version 2)` and so on until nothing has claimed it. */
export function sidecarPathFor(relPath: string, suffix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const { dir, base } = splitPath(relPath);
  const stem = stemOf(base);
  const ext = extensionOf(base);

  const first = `${dir}${stem} (${suffix})${ext}`;
  if (!used.has(first)) return first;
  for (let i = 2; ; i++) {
    const candidate = `${dir}${stem} (${suffix} ${i})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function keepBothPathFor(relPath: string, taken: Iterable<string>): string {
  return sidecarPathFor(relPath, "my version", taken);
}

/** An id nothing else has claimed.

    Same shape as `uniqueId` in state/trash.ts, and for the same reason:
    the vault indexes notes BY id, so adding one whose id is already live
    evicts the live note from the index. A sync client's conflict copy
    carries the ORIGINAL note's frontmatter id verbatim, which makes this
    the single most likely way to lose a chapter in this whole feature.

    It is duplicated rather than imported because this module is pure by
    contract — nothing here may reach into state/. */
export function uniqueIdAmong(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(desired)) return desired;
  for (let i = 2; ; i++) {
    const candidate = `${desired}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

/* ============================================================
   D3 — recognising a sync client's leftovers

   Every service resolves "two machines edited this" the same way:
   keep both, mangle one name, tell nobody. The mangled file is a
   perfectly valid Markdown note as far as the vault engine is
   concerned, so without this it loads as a real chapter — usually
   with the SAME frontmatter id as the original, which evicts the
   original from the link index. One sync hiccup, and a chapter
   disappears from the codex while its duplicate takes the name.

   So: recognise them, keep them out of the index, and hand them to
   the writer as a decision. Nothing here deletes anything, ever.

   Two tiers of confidence, and the split matters:

     Unambiguous — "conflicted copy", ".sync-conflict-", "-DESKTOP-".
     No human names a chapter that way. Flagged on sight.

     Ambiguous — the bare numeric suffixes Drive ("Chapter 7 (1).md")
     and iCloud ("Chapter 7 2.md") use. These collide with names a
     writer would genuinely choose, so they are only trusted when the
     file they claim to be a copy OF is sitting in the same folder.
     `Act 2.md` in a vault with no `Act.md` is a chapter, not junk.

   Even then a false positive is possible, which is why the panel
   offers "load it as a note" as a first-class button rather than
   burying it. Flagging is a question, not a verdict.
   ============================================================ */

export type ConflictService = "dropbox" | "drive" | "onedrive" | "syncthing" | "icloud";

export type VaultFileKind = "note" | "temp" | "conflict" | "hidden";

export interface VaultFileClass {
  kind: VaultFileKind;
  /** Which sync client's handwriting this is, when kind is "conflict". */
  service?: ConflictService;
  /** The path this appears to be a copy OF, in the same folder. */
  origin?: string;
  /** True when the NAME alone isn't proof — `origin` must really exist. */
  requiresOrigin?: boolean;
  /** Set for bare-number names, which are also how humans number
      chapters. Files sharing a key form a series; see the escape hatch
      in `partitionVaultFiles`. */
  seriesKey?: string;
  /** One plain sentence for the writer. No jargon, no file paths. */
  label?: string;
}

const SERVICE_LABEL: Record<ConflictService, string> = {
  dropbox: "Dropbox",
  drive: "Google Drive",
  onedrive: "OneDrive",
  syncthing: "Syncthing",
  icloud: "iCloud",
};

/* Each rule strips its own suffix off the STEM, so the origin it
   reports carries the original extension back. Order matters only in
   that the unambiguous rules are tried first — a name that matches
   both should be treated as the confident case. */
const RULES: {
  service: ConflictService;
  re: RegExp;
  requiresOrigin?: boolean;
  series?: boolean;
}[] = [
  // Dropbox: "Chapter 7 (Drew's conflicted copy 2026-08-19).md", and the
  // plain "(conflicted copy 2026-08-19)" when it can't name the device.
  // iCloud on macOS uses the same words, so this covers both.
  { service: "dropbox", re: /\s*\([^()]*conflicted copy[^()]*\)$/i },
  // Syncthing: "Chapter 7.sync-conflict-20260819-140523-K3F9QW2.md".
  { service: "syncthing", re: /\.sync-conflict-[-\w]*$/i },
  // OneDrive: "Chapter 7-DESKTOP-AB12.md" — the device name, which on
  // Windows is DESKTOP-/LAPTOP- shaped by default. Anchored to those
  // prefixes on purpose: a bare "-[A-Z0-9]+$" would swallow a chapter
  // called "Act 2-FINAL".
  { service: "onedrive", re: /-(?:DESKTOP|LAPTOP|MACBOOK|IMAC|WINDOWS|PC)-[A-Z0-9]+$/i },
  // Google Drive: "Chapter 7 (1).md", and "(1) (1)" when it happens twice.
  { service: "drive", re: /\s*\(\d{1,3}\)$/, requiresOrigin: true },
  // iCloud Drive: "Chapter 7 2.md". The loosest pattern here by a mile,
  // hence requiresOrigin, the 2-99 ceiling ("Chapter 7 1900.md" is a year
  // in a title, not a copy) and the series escape hatch.
  { service: "icloud", re: /\s+(?:[2-9]|[1-9]\d)$/, requiresOrigin: true, series: true },
];

/** PURE. What is this file, judging by its name alone?

    Never consults a filesystem and never looks at siblings — that is
    `partitionVaultFiles`'s job, which is why anything guessy comes back
    with `requiresOrigin` set rather than already decided.

    Read the result carefully: `kind: "conflict"` WITH `requiresOrigin`
    is a suspicion, not a finding. `Chapter 7.md` lands there, because
    it is a name ending in a number and that is precisely what an iCloud
    conflict copy looks like. Only `partitionVaultFiles`, which can see
    whether `Chapter.md` exists next to it, can settle the question — so
    call that, not this, when the answer decides what loads. */
export function classifyVaultFile(path: string): VaultFileClass {
  if (isTempPath(path)) {
    return { kind: "temp", label: "A half-finished save Novella left behind." };
  }

  const { dir, base } = splitPath(path);
  // Dotfiles and anything under a dotfolder are config, history and
  // trash — the same rule every adapter's readAll already applies.
  if (base.startsWith(".") || /(^|[/\\])\./.test(dir)) return { kind: "hidden" };

  const ext = extensionOf(base);
  const stem = stemOf(base);

  for (const rule of RULES) {
    if (!rule.re.test(stem)) continue;
    // One strip, not a loop. "Chapter 7 (1) (1).md" claims to be a copy
    // of "Chapter 7 (1).md" and that is exactly what we report — walking
    // all the way back to "Chapter 7.md" would be a guess, and the
    // conservative direction here is to under-claim.
    const origin = stem.replace(rule.re, "").trimEnd();
    if (!origin) continue; // the whole name was the suffix — not a copy of anything

    const out: VaultFileClass = {
      kind: "conflict",
      service: rule.service,
      origin: `${dir}${origin}${ext}`,
      label: `${SERVICE_LABEL[rule.service]} saved this as a second copy when two machines edited the same note.`,
    };
    if (rule.requiresOrigin) out.requiresOrigin = true;
    if (rule.series) out.seriesKey = `${dir}${origin}${ext}`.toLowerCase();
    return out;
  }

  return { kind: "note" };
}

export interface FlaggedFile<T> {
  file: T;
  info: VaultFileClass;
}

export interface Partitioned<T> {
  /** Real notes. These, and only these, go into the vault index. */
  notes: T[];
  /** Sync-client leftovers, held aside for the writer to judge. */
  conflicts: FlaggedFile<T>[];
  /** Temp files and dotfiles. Dropped silently — no writer cares. */
  skipped: T[];
}

/** How many bare-numbered siblings it takes before we call it a series
    rather than a pile of conflict copies. */
export const SERIES_ESCAPE = 3;

/** PURE. Split a directory listing into notes, conflict copies and noise.

    Two things this adds over `classifyVaultFile`, both of which need
    to see the whole folder:

    1. An ambiguous name is only condemned when the file it claims to
       be a copy OF is actually present. `Act 2.md` in a vault with no
       `Act.md` is a chapter.
    2. The series escape hatch. A vault holding `Chapter.md` plus
       `Chapter 2.md` … `Chapter 12.md` is a writer's numbering scheme,
       and flagging eleven chapters as iCloud junk would be a
       catastrophe dressed as a safety feature. Three or more siblings
       sharing an origin means the number is the writer's, so they all
       load as notes. Parenthesised Drive names are exempt from the
       escape: nobody numbers their chapters "(1)", "(2)", "(3)".

    Comparison is case-insensitive because Windows and macOS
    filesystems are, and a rule that only fires on Linux is worse than
    no rule at all. */
export function partitionVaultFiles<T extends { path: string }>(files: T[]): Partitioned<T> {
  const present = new Set(files.map((f) => f.path.toLowerCase()));

  const judged = files.map((file) => ({ file, info: classifyVaultFile(file.path) }));

  // Count the bare-number families before deciding anything.
  const seriesSize = new Map<string, number>();
  for (const { info } of judged) {
    if (info.kind !== "conflict" || !info.seriesKey) continue;
    seriesSize.set(info.seriesKey, (seriesSize.get(info.seriesKey) ?? 0) + 1);
  }

  const notes: T[] = [];
  const conflicts: FlaggedFile<T>[] = [];
  const skipped: T[] = [];

  for (const { file, info } of judged) {
    if (info.kind === "note") {
      notes.push(file);
      continue;
    }
    if (info.kind !== "conflict") {
      skipped.push(file);
      continue;
    }
    const originHere = present.has((info.origin ?? "").toLowerCase());
    const isSeries = info.seriesKey !== undefined && (seriesSize.get(info.seriesKey) ?? 0) >= SERIES_ESCAPE;
    if ((info.requiresOrigin && !originHere) || isSeries) notes.push(file);
    else conflicts.push({ file, info });
  }

  return { notes, conflicts, skipped };
}
