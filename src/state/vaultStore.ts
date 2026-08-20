import { useSyncExternalStore } from "react";
import { Vault, parseNote, serializeNote, linksOf, type Note } from "../core/vault";
import { storage, type VaultFile } from "../storage";
import type { TauriStorage } from "../storage/tauriStorage";
import {
  decideWrite,
  diskChanged,
  keepBothPathFor,
  partitionVaultFiles,
  sidecarPathFor,
  uniqueIdAmong,
  type FlaggedFile,
} from "../storage/vaultSafety";
import { SEED_FILES } from "../seed/seedWorld";
import { desktopLog } from "../debug";
import { BUILTIN_PROMPTS, promptSeedToMarkdown } from "../ai/prompts";
import { extractTasks, toggleTaskAt, type BodyTask } from "../core/tasks";

/* A thin reactive shell around the Phase 1 Vault engine.
   vault.ts stays untouched — it holds Note objects by reference, so
   editing a note in place is visible to the index immediately. This
   class only adds change notification, the notion of "which note is
   open", and persistence — all UI concerns the engine shouldn't know. */

/** One note whose file changed on disk while the writer had unsaved
    edits. Nothing is written until they say which version wins. */
export interface SaveConflict {
  noteId: string;
  path: string;
  title: string;
  /** The writer's version, serialized exactly as it would have landed. */
  mine: string;
  /** What the file holds right now. */
  theirs: string;
  /** Epoch ms the clash was noticed. */
  at: number;
}

export class VaultStore {
  private index = new Vault();
  private listeners = new Set<() => void>();
  private version = 0;
  private activeId: string | undefined;
  private dirty = new Set<string>();
  private root: string | null = null;
  private busy = false;
  private lastError: string | null = null;
  /** Files a sync client left behind, held out of the index until the
      writer says what they are. Rebuilt on every ingest. */
  private flagged: FlaggedFile<VaultFile>[] = [];
  /** noteId -> the clash waiting on a decision. While a note is in here
      saveAll refuses to write it: the words stay in memory (and in the
      localStorage draft snapshot), and disk keeps whatever arrived. */
  private pending = new Map<string, SaveConflict>();

  /** The live index. Components read from this; it is never reassigned
      in place, so always go through the getter rather than caching it. */
  get vault(): Vault {
    return this.index;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): number => this.version;

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /* ---------- loading ---------- */

  /* Observation hooks.

     Features like revision history need to know when the vault is swapped
     or a note is about to be written, but this module must not depend on
     them — it's the layer they build on. So they register here and the
     dependency stays one-way. */
  private replacedHooks = new Set<() => void>();
  private beforeSaveHooks = new Set<(note: Note) => void | Promise<void>>();
  private afterSaveHooks = new Set<() => void>();

  /** Run when the entire vault is replaced — a different project opened. */
  onVaultReplaced(fn: () => void): () => void {
    this.replacedHooks.add(fn);
    return () => {
      this.replacedHooks.delete(fn);
    };
  }

  /** Run for each note just before it is written to disk. */
  onBeforeSave(fn: (note: Note) => void | Promise<void>): () => void {
    this.beforeSaveHooks.add(fn);
    return () => {
      this.beforeSaveHooks.delete(fn);
    };
  }

  /** Run once after a save batch lands — "the writer's work just reached
      disk", not once per file. Agents key off this. */
  onAfterSave(fn: () => void): () => void {
    this.afterSaveHooks.add(fn);
    return () => {
      this.afterSaveHooks.delete(fn);
    };
  }

  /** Replace the whole vault from a set of files. */
  private ingest(files: VaultFile[]): void {
    // Sync clients drop second copies of a note beside the original —
    // "Chapter 7 (conflicted copy 2026-08-19).md" and friends — and those
    // copies carry the ORIGINAL's frontmatter id. Loading one would evict
    // the real chapter from the link index: the note vanishes from the
    // codex and its duplicate answers to its name. So they are held aside
    // here and handed to the writer as a question instead. Nothing is
    // deleted; see conflictCopies() and the two doors out below it.
    const { notes, conflicts } = partitionVaultFiles(files);
    this.flagged = conflicts;

    const next = new Vault();
    for (const f of notes) next.add(parseNote(f.path, f.contents));
    this.index = next;
    this.activeId = next.byType("chapter")[0]?.id ?? next.all()[0]?.id;
    this.dirty.clear();
    this.pending.clear();
    // Re-seed the built-in prompts on every swap. Without this, switching
    // projects silently emptied the Assistant's prompt list — the prompts
    // are in-memory notes, and a fresh index doesn't have them.
    this.ensureBuiltinPrompts();
    for (const fn of this.replacedHooks) fn();
    this.emit();
    if (this.flagged.length > 0) this.notifySafetyUi();
  }

  /** First run: the bundled seed world, held in memory. */
  loadSeed(): void {
    this.root = null;
    this.ingest(SEED_FILES.map(([path, contents]) => ({ path, contents })));
  }

  /** Let the user choose a real folder, then load every .md inside it. */
  async openFolder(): Promise<boolean> {
    const store = storage();
    this.busy = true;
    this.lastError = null;
    this.emit();
    try {
      const picked = await store.pickFolder();
      if (!picked) return false;
      const files = await store.readAll(picked);
      this.root = picked;
      this.ingest(files);
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  /** Open a known path without the picker. Used by the dev self-test and
      by anything that already has an authorized root. */
  async openFolderAt(path: string): Promise<boolean> {
    const backing = storage();
    this.busy = true;
    this.lastError = null;
    this.emit();
    try {
      await backing.grantAccess(path);
      const files = await backing.readAll(path);
      this.root = path;
      this.ingest(files);
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  /** Re-read every file from whatever storage is backing this vault.

      Used after a bulk write like an import: rebuilding the index from
      what is actually on disk is the only way to be sure the app agrees
      with the filesystem, rather than trusting an in-memory guess about
      what those writes produced. */
  async reloadFromStorage(): Promise<boolean> {
    const backing = storage();
    // With no root, only the memory adapter can answer readAll (it ignores
    // the argument). Asking IndexedDB or the disk for root "" would come
    // back empty and wipe a vault that's actually fine.
    if (this.root === null && backing.kind !== "memory") return false;
    this.busy = true;
    this.lastError = null;
    this.emit();
    try {
      this.ingest(await backing.readAll(this.root ?? ""));
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  /* ---------- saving ---------- */

  /** Write every dirty note back to disk in its original Markdown form.

      A vault in a Dropbox/Drive/iCloud folder has a second writer, so
      every write here first asks "has this file moved under me?" — see
      guardWrite below. The check costs one stat per dirty note on the
      desktop build and nothing at all in the browser, where there is no
      second writer and no mtime to ask about. */
  async saveAll(): Promise<void> {
    if (this.dirty.size === 0) return;
    // Everything still unsaved is waiting on the writer. Returning here
    // is not an optimisation: saveAll ends in emit(), emit re-triggers
    // the autosave effect, and the effect schedules the next saveAll —
    // so without this a pending conflict would spin the app in a 1.5s
    // loop for as long as the dialog is open.
    if ([...this.dirty].every((id) => this.pending.has(id))) return;
    const store = storage();
    const root = this.root;
    let wroteAny = false;
    let blocked = 0;

    // Memory storage has no root and cannot truly persist; writing to it
    // still keeps this session consistent, so don't bail out.
    this.busy = true;
    this.lastError = null;
    this.emit();
    try {
      for (const id of [...this.dirty]) {
        const note = this.index.get(id);
        if (!note) continue;
        // Already waiting on the writer. Leave it dirty — the words are
        // still in memory and still in the draft snapshot — and do not
        // re-stat it every 1.5 seconds for as long as the dialog is up.
        if (this.pending.has(id)) {
          blocked++;
          continue;
        }

        const verdict = await this.guardWrite(note);
        if (verdict === "reload") {
          // Their version, our copy had nothing to keep. No dialog: the
          // note is already correct on screen and nothing was lost.
          this.dirty.delete(id);
          continue;
        }
        if (verdict === "conflict") {
          blocked++;
          continue;
        }

        // Snapshot before the write, so history records the version that
        // was actually committed. A failing hook must never block a save —
        // losing a revision is survivable, losing the manuscript is not.
        for (const fn of this.beforeSaveHooks) {
          try {
            await fn(note);
          } catch {
            /* history is best-effort */
          }
        }
        await store.write(root ?? "", note.path, serializeNote(note));
        this.dirty.delete(id);
        wroteAny = true;
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
      if (blocked > 0 && this.lastError === null) {
        this.lastError =
          blocked === 1
            ? "A note changed on disk while you were writing. Nothing was overwritten — choose which version to keep."
            : `${blocked} notes changed on disk while you were writing. Nothing was overwritten — choose which versions to keep.`;
      }
      this.emit();
      if (wroteAny) {
        for (const fn of this.afterSaveHooks) {
          try {
            fn();
          } catch {
            /* a listener must never break saving */
          }
        }
      }
    }
  }

  /* ---------- don't clobber newer (D2) ----------

     The decision itself is pure and lives in storage/vaultSafety.ts.
     This is only the part that has to touch a filesystem: read the two
     mtimes, work out whether our copy actually differs from the text we
     last saw, and — when it does — capture their version for the dialog.

     Deliberately NOT a filesystem watcher. `notify` isn't in Cargo.lock,
     and sync clients deliver changes seconds-to-minutes late anyway, so
     sub-second precision would buy nothing but a background thread that
     wakes up during every one of the writer's own saves. Checking at the
     moment we are about to overwrite is both cheaper and exactly when
     the answer matters.

     Everything degrades to "write" — no baseline, no stat, no mtime, a
     web or memory adapter, a brand-new file. Not knowing is never
     evidence that somebody else edited the file, and refusing to save on
     an absence of evidence would turn this into a new way to lose work. */
  private async guardWrite(note: Note): Promise<"write" | "reload" | "conflict"> {
    const backing = storage();
    const root = this.root;
    // Narrowed on `kind`, the pattern ProjectsPanel already uses for
    // WebStorage.rootExists. IndexedDB and memory have no mtime and no
    // second writer; a browser writer is exactly as well off as before.
    if (root === null || backing.kind !== "tauri") return "write";
    const disk = backing as TauriStorage;

    const known = disk.knownMtime(root, note.path);
    const now = await disk.statMtime(root, note.path);
    if (!diskChanged(known, now)) return "write";

    // Only now is the expensive comparison worth doing. "Dirty" here
    // means genuinely different from the bytes we last saw — not merely
    // flagged dirty, which a rename or an undone edit also does. Both
    // sides go through parse→serialize so YAML re-emission differences
    // don't read as a conflict.
    const baseline = disk.knownText(root, note.path);
    const mine = serializeNote(note);
    const hasLocalEdits =
      baseline === null || serializeNote(parseNote(note.path, baseline)) !== mine;

    const verdict = decideWrite({ ourMtime: known, diskMtime: now, dirty: hasLocalEdits });
    if (verdict === "write") return "write";

    // readOne re-reads AND re-baselines, which is what makes "keep mine"
    // work later: by then our recorded mtime is theirs, so the write is
    // no longer clobbering anything we hadn't seen.
    const theirs = await disk.readOne(root, note.path);
    if (theirs === null) return "write"; // unreadable — don't hold the save hostage

    if (verdict === "reload") {
      this.adoptDiskVersion(note, theirs);
      return "reload";
    }

    this.pending.set(note.id, {
      noteId: note.id,
      path: note.path,
      title: note.title,
      mine,
      theirs,
      at: Date.now(),
    });
    this.notifySafetyUi();
    return "conflict";
  }

  /** Overwrite a note in place from raw disk Markdown.

      In place, and keeping OUR id, because the vault holds notes by
      reference and half the app (boards, sessions, history) remembers
      note ids. Swapping in a fresh object would orphan every one of
      those. If the disk copy carries a different frontmatter id, ours
      wins — a changed id is not worth an orphaned corkboard. */
  private adoptDiskVersion(note: Note, raw: string): void {
    const fresh = parseNote(note.path, raw);
    note.type = fresh.type;
    note.title = fresh.title;
    note.aliases = fresh.aliases;
    note.tags = fresh.tags;
    note.data = { ...fresh.data, id: note.id };
    note.body = fresh.body;
    // Re-register so the new title and aliases resolve links.
    this.index.add(note);
    this.forgetDraft(note.id);
    this.emit();
  }

  /** Wake the conflict dialog.

      A dynamic import, and pointing UP a layer at that, which needs an
      argument: this module cannot import UI, and App.tsx is not ours to
      edit, so without this the whole feature would sit silent until
      somebody adds a mount line. The import only ever runs in a browser
      and only when there is genuinely something to ask about, so a
      headless test never touches React. Once <ConflictHost /> is mounted
      in App.tsx this becomes a no-op — the panel checks for a real host
      before mounting its own. */
  private notifySafetyUi(): void {
    if (typeof document === "undefined") return;
    void import("../ui/ConflictPanel").catch(() => {
      // No UI available (a headless run, a build that tree-shook it).
      // The conflict is still recorded and still blocking the write,
      // which is the part that protects the manuscript.
    });
  }

  /** Drop the crash-recovery snapshot for a note we just replaced from
      disk, so the recovery banner doesn't offer back the very version
      the writer chose to discard. Dynamic import: state/autosave imports
      this module, and a static edge would be a cycle. */
  private forgetDraft(id: string): void {
    void import("./autosave")
      .then((m) => m.clearDraft(id))
      .catch(() => {
        /* no localStorage (node, private browsing) — nothing to clear */
      });
  }

  /* ---------- the writer's three answers ---------- */

  /** Notes waiting on a decision, oldest first. */
  conflicts(): SaveConflict[] {
    return [...this.pending.values()].sort((a, b) => a.at - b.at);
  }

  conflictCount(): number {
    return this.pending.size;
  }

  /** Resolve one clash.

      "mine"   — our text wins. The baseline is already their version
                 (guardWrite re-read it), so the ordinary save path now
                 has permission and no special case is needed.
      "theirs" — take the file as it stands and drop our edits.
      "both"   — the disk copy keeps the canonical path so every
                 [[wiki link]] still resolves, and our version lands
                 beside it as a new note the writer can read and merge
                 by hand. Nothing is thrown away in this branch, which
                 is why it's the safe answer when unsure. */
  async resolveConflict(noteId: string, choice: "mine" | "theirs" | "both"): Promise<void> {
    const clash = this.pending.get(noteId);
    const note = this.index.get(noteId);
    if (!clash || !note) {
      this.pending.delete(noteId);
      this.emit();
      return;
    }
    this.pending.delete(noteId);

    if (choice === "theirs") {
      this.adoptDiskVersion(note, clash.theirs);
      this.dirty.delete(noteId);
      this.lastError = null;
      this.emit();
      return;
    }

    if (choice === "both") {
      const path = keepBothPathFor(note.path, this.index.all().map((n) => n.path));
      const copy = parseNote(path, clash.mine);
      // Our version is a duplicate of the note it forked from — same id,
      // same title — so it needs its own identity before it goes in.
      this.makeDistinct(copy, "my version");
      this.index.add(copy);
      this.dirty.add(copy.id);
      this.adoptDiskVersion(note, clash.theirs);
      this.dirty.delete(noteId);
    } else {
      this.dirty.add(noteId);
    }

    this.lastError = null;
    this.emit();
    await this.saveAll();
  }

  /* ---------- D3: what a sync client left behind ----------

     These files are real Markdown and may hold real prose — quite
     possibly the only surviving copy of an hour's work from another
     machine. So nothing here deletes one. There are exactly three
     doors: keep it (renamed to something sane), put it in the trash
     where the retention window can look after it, or leave it alone
     and stop being asked. */

  /** Files held out of the index because they look like sync leftovers. */
  conflictCopies(): FlaggedFile<VaultFile>[] {
    return this.flagged;
  }

  /** Keep it as a real note.

      Renamed on the way in, for two reasons: the sync-client name would
      be flagged again on the next open, and `Chapter 7 (from another
      device).md` is a name a writer can act on. The new file is written
      BEFORE the old one is removed — the same ordering trash.ts uses,
      so a storage failure leaves the copy exactly where it was rather
      than nowhere. */
  async adoptConflictCopy(path: string): Promise<string | null> {
    const entry = this.flagged.find((f) => f.file.path === path);
    if (!entry) return null;

    const target = sidecarPathFor(
      entry.info.origin ?? path,
      "from another device",
      this.index.all().map((n) => n.path),
    );
    const note = parseNote(target, entry.file.contents);
    this.makeDistinct(note, "from another device");
    this.index.add(note);
    this.dirty.add(note.id);
    this.flagged = this.flagged.filter((f) => f.file.path !== path);
    this.emit();

    await this.saveAll();
    // Only once the new file actually exists. A note still marked dirty
    // is the honest signal that the write did not land.
    //
    // The root dance mirrors reloadFromStorage: memory storage ignores
    // the argument, so "" is right there, while a null root on any other
    // adapter means we have no idea where the file lives and must not
    // guess — remove("", path) on disk would resolve to "/path".
    const backing = storage();
    const removeRoot = this.root ?? (backing.kind === "memory" ? "" : null);
    if (removeRoot !== null && !this.dirty.has(note.id)) {
      try {
        await backing.remove(removeRoot, path);
      } catch {
        // The copy is safe under its new name; a leftover duplicate is
        // untidy, not lost. It gets flagged again next open.
      }
    }
    return note.id;
  }

  /** Put a flagged file into the vault index just long enough for the
      trash to archive it, WITHOUT marking it dirty — an autosave firing
      between here and moveToTrash would otherwise write it straight back
      out. Its path is the real on-disk path, so deleteNote removes the
      actual file once the trash holds a copy. */
  stageConflictCopyForTrash(path: string): Note | null {
    const entry = this.flagged.find((f) => f.file.path === path);
    if (!entry) return null;
    const note = parseNote(entry.file.path, entry.file.contents);
    this.makeDistinct(note, "sync copy");
    this.index.add(note);
    this.flagged = this.flagged.filter((f) => f.file.path !== path);
    this.emit();
    return note;
  }

  /** Give a copy its own identity before it enters the index.

      A sync client's conflict copy is a byte-for-byte duplicate: same
      frontmatter id, same name. Adding it as-is does two kinds of damage
      at once — Vault.add keys notes BY id, so the original is evicted
      outright, and it keys the link table by title, so every [[Chapter
      7]] in the book starts pointing at the duplicate. And when the
      duplicate is later removed, Vault.remove drops every link entry
      aimed at it, taking the original's entry with it.

      Both are fixed by the same two lines: a unique id and a title
      nothing else answers to. The suffix is shown to the writer, so it
      reads as a label rather than a mangled filename. */
  private makeDistinct(note: Note, suffix: string): void {
    note.id = uniqueIdAmong(note.id, this.index.all().map((n) => n.id));
    note.data.id = note.id;

    let title = `${note.title} (${suffix})`;
    for (let i = 2; this.index.resolveLink(title); i++) title = `${note.title} (${suffix} ${i})`;
    note.title = title;
    note.data.name = title;
  }

  /** Stop asking about it. The file stays on disk, untouched, and turns
      up again the next time the project is opened — which is the right
      amount of persistence for "not now". */
  forgetConflictCopy(path: string): void {
    this.flagged = this.flagged.filter((f) => f.file.path !== path);
    this.emit();
  }

  /* ---------- navigation ---------- */

  open(id: string): void {
    this.activeId = id;
    this.emit();
  }

  /** Open by link text, honoring aliases. Returns false for dangling links. */
  openByName(name: string): boolean {
    const note = this.index.resolveLink(name);
    if (!note) return false;
    this.open(note.id);
    return true;
  }

  active(): Note | undefined {
    return this.activeId ? this.index.get(this.activeId) : undefined;
  }

  activeIdOrUndefined(): string | undefined {
    return this.activeId;
  }

  /* ---------- editing ---------- */

  /* Trap for the phantom-dirty bug (task #13): a note going dirty on the
     Tauri build with no user edit. It stopped reproducing, and the cause
     was never established — so rather than assume it's gone, this logs the
     first edit of a session with a stack trace. Terminal only; nothing is
     shown in the UI, and normal typing produces one harmless line. */
  private loggedFirstDirty = false;

  setBody(id: string, body: string): void {
    const note = this.index.get(id);
    if (!note || note.body === body) return;

    if (!this.loggedFirstDirty) {
      this.loggedFirstDirty = true;
      const a = note.body;
      let i = 0;
      while (i < a.length && i < body.length && a[i] === body[i]) i++;
      desktopLog(
        `first edit of session on "${note.title}": len ${a.length}→${body.length} @${i} ` +
          `old=${JSON.stringify(a.slice(i, i + 12))} new=${JSON.stringify(body.slice(i, i + 12))}`,
      );
      desktopLog(`  via: ${new Error().stack?.split("\n").slice(2, 5).join(" | ")}`);
    }

    note.body = body;
    this.dirty.add(id);
    this.emit();
  }

  /** Replace a note's tags. Tags live on note.tags (not data), which is
      what serializeNote writes back to frontmatter. */
  setTags(id: string, tags: string[]): void {
    const note = this.index.get(id);
    if (!note) return;
    note.tags = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    this.dirty.add(id);
    this.emit();
  }

  setFrontmatterField(id: string, key: string, value: unknown): void {
    const note = this.index.get(id);
    if (!note) return;
    note.data[key] = value;
    this.dirty.add(id);
    this.emit();
  }

  /* ---------- scene beats ---------- */

  /* Beats live in frontmatter rather than in the prose. Three reasons:
     serializeNote round-trips them with no extra code, linksOf() already
     scans frontmatter so a [[character]] named in a beat shows up in that
     character's backlinks, and the manuscript body stays pure prose. */

  beatsOf(note: Note): string[] {
    const raw = note.data.beats;
    return Array.isArray(raw) ? raw.map((b) => String(b)) : [];
  }

  setBeats(id: string, beats: string[]): void {
    const note = this.index.get(id);
    if (!note) return;
    const cleaned = beats.map((b) => b.trim()).filter(Boolean);
    if (cleaned.length) note.data.beats = cleaned;
    else delete note.data.beats;
    this.dirty.add(id);
    this.emit();
  }

  /* ---------- tasks ---------- */

  tasksOf(note: Note): BodyTask[] {
    return extractTasks(note.body);
  }

  /** Every task in the project, paired with its note. Chapters first in
      manuscript order, then everything else — the order a writer would
      review them in. */
  allTasks(): { note: Note; task: BodyTask }[] {
    const chapters = this.orderedChapters();
    const chapterIds = new Set(chapters.map((c) => c.id));
    const rest = this.index
      .all()
      .filter((n) => !chapterIds.has(n.id) && n.type !== "prompt")
      .sort((a, b) => a.title.localeCompare(b.title));
    const out: { note: Note; task: BodyTask }[] = [];
    for (const note of [...chapters, ...rest]) {
      for (const task of extractTasks(note.body)) out.push({ note, task });
    }
    return out;
  }

  /** Flip one checkbox. Goes through setBody so dirty-tracking, autosave,
      drafts and history all see it as the edit it is. */
  toggleTask(id: string, checkbox: number): void {
    const note = this.index.get(id);
    if (!note) return;
    const next = toggleTaskAt(note.body, checkbox);
    if (next !== null) this.setBody(id, next);
  }

  /* ---------- plot grid ---------- */

  /* Plot points live in a chapter's own frontmatter under `plot`, a map of
     thread id -> list of points:

       plot:
         mystery: ["A body washes up", "The compass is missing"]
         romance: ["They meet at the dock"]

     Keeping them ON the chapter means reordering the board moves a scene's
     plot points with it for free — they're in the file that moved. Thread
     names and colours are project config and live elsewhere (.novella),
     but the points themselves are content and belong with the prose. */

  /** The raw plot map for a note: thread id -> points. Never mutated. */
  plotOf(note: Note): Record<string, string[]> {
    const raw = note.data.plot;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string[]> = {};
    for (const [threadId, points] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(points)) out[threadId] = points.map((p) => String(p));
    }
    return out;
  }

  plotPointsOf(note: Note, threadId: string): string[] {
    return this.plotOf(note)[threadId] ?? [];
  }

  /** Every thread id referenced by any chapter's frontmatter. Lets the grid
      recover its columns from the content alone, even if the thread config
      is missing — orphaned points still show up rather than vanishing. */
  plotThreadIdsInUse(): string[] {
    const seen = new Set<string>();
    for (const note of [...this.index.byType("chapter"), ...this.index.byType("scene")]) {
      for (const id of Object.keys(this.plotOf(note))) seen.add(id);
    }
    return [...seen];
  }

  setPlotPoints(chapterId: string, threadId: string, points: string[]): void {
    const note = this.index.get(chapterId);
    if (!note) return;
    const cleaned = points.map((p) => p.trim()).filter(Boolean);
    const map = { ...this.plotOf(note) };
    if (cleaned.length) map[threadId] = cleaned;
    else delete map[threadId];

    if (Object.keys(map).length) note.data.plot = map;
    else delete note.data.plot;
    this.dirty.add(chapterId);
    this.emit();
  }

  /** Drop a thread from every chapter that used it. Called when a thread is
      deleted from the config, so no orphaned points linger in frontmatter. */
  removePlotThread(threadId: string): void {
    for (const note of [...this.index.byType("chapter"), ...this.index.byType("scene")]) {
      const map = this.plotOf(note);
      if (!(threadId in map)) continue;
      delete map[threadId];
      if (Object.keys(map).length) note.data.plot = map;
      else delete note.data.plot;
      this.dirty.add(note.id);
    }
    this.emit();
  }

  /* ---------- chapter order ---------- */

  /* Manuscript order lives in an `order` frontmatter number rather than in
     filenames. Dragging a card on the board would otherwise mean renaming
     files — which breaks every [[link]] pointing at them. */

  orderedChapters(): Note[] {
    const chapters = [...this.index.byType("chapter"), ...this.index.byType("scene")];
    return chapters.sort((a, b) => {
      const ao = typeof a.data.order === "number" ? a.data.order : Number.POSITIVE_INFINITY;
      const bo = typeof b.data.order === "number" ? b.data.order : Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return a.path.localeCompare(b.path);
    });
  }

  /** Write a new running order. Only notes whose position actually moved
      are marked dirty, so reordering two cards doesn't rewrite the book. */
  reorderChapters(idsInOrder: string[]): void {
    idsInOrder.forEach((id, i) => {
      const note = this.index.get(id);
      if (!note) return;
      const next = i + 1;
      if (note.data.order === next) return;
      note.data.order = next;
      this.dirty.add(id);
    });
    this.emit();
  }

  /* ---------- prompts ---------- */

  /** Seed the built-in prompt notes if the vault has none.
      Held in memory only — they are not marked dirty, so opening a vault
      never silently writes files the writer didn't ask for. Edit one and
      it becomes a real file on the next save. */
  ensureBuiltinPrompts(): void {
    // Merge by name rather than all-or-nothing: a project that already has
    // prompt notes still receives built-ins ADDED since it was created,
    // while the writer's own prompts and edits are never touched.
    const have = new Set(this.index.byType("prompt").map((n) => n.title.toLowerCase()));
    let added = false;
    for (const seed of BUILTIN_PROMPTS) {
      if (have.has(seed.name.toLowerCase())) continue;
      const file = seed.name.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      this.index.add(parseNote(`Prompts/${file}.md`, promptSeedToMarkdown(seed)));
      added = true;
    }
    if (added) this.emit();
  }

  prompts(): Note[] {
    return this.index.byType("prompt");
  }

  /* ---------- status ---------- */

  isDirty(id: string): boolean {
    return this.dirty.has(id);
  }
  dirtyCount(): number {
    return this.dirty.size;
  }
  vaultRoot(): string | null {
    return this.root;
  }
  isBusy(): boolean {
    return this.busy;
  }
  error(): string | null {
    return this.lastError;
  }
  isPersistent(): boolean {
    return storage().persistent && this.root !== null;
  }

  /** Serialize a note back to its on-disk Markdown form. */
  fileContents(id: string): string | undefined {
    const note = this.index.get(id);
    return note ? serializeNote(note) : undefined;
  }

  /* ---------- link helpers ---------- */

  /** Every name this note references, resolved or not. */
  outgoingLinks(note: Note): { name: string; note: Note | undefined }[] {
    const seen = new Set<string>();
    const out: { name: string; note: Note | undefined }[] = [];
    for (const name of linksOf(note)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, note: this.index.resolveLink(name) });
    }
    return out;
  }

  /** All titles and aliases — the source for [[link]] autocomplete. */
  linkTargets(): string[] {
    const names: string[] = [];
    for (const note of this.index.all()) {
      names.push(note.title, ...note.aliases);
    }
    return names.sort((a, b) => a.localeCompare(b));
  }

  /** Rename a note in place. The file stays put (moving it would break
      nothing — but there's no need), and the OLD title keeps resolving in
      the link index, alias-like, so existing [[links]] don't go dangling
      the moment a name changes. */
  renameNote(id: string, title: string): void {
    const note = this.index.get(id);
    const clean = title.trim();
    if (!note || !clean || note.title === clean) return;
    note.title = clean;
    note.data.name = clean;
    // Re-registering adds the new title to the resolve map; the old entry
    // stays behind and still points here.
    this.index.add(note);
    this.dirty.add(id);
    this.emit();
  }

  /** Delete a note. Returns a snapshot restoreNote() accepts, so the UI
      can offer undo instead of a scary confirm dialog. On disk the file
      is copied into .novella/trash/ before being removed — if the undo
      toast is missed, the words still exist somewhere. */
  async deleteNote(id: string): Promise<{ note: Note; wasActive: boolean } | null> {
    const note = this.index.get(id);
    if (!note) return null;
    const wasActive = this.activeId === id;

    this.index.remove(id);
    this.dirty.delete(id);
    if (wasActive) {
      this.activeId = this.orderedChapters()[0]?.id ?? this.index.all()[0]?.id;
    }
    this.emit();

    if (this.root) {
      // No copy is taken here: state/trash.ts is the only caller, and it
      // has already committed the note to the retention folder before
      // reaching this point. A second copy written here would never
      // expire, so it would quietly grow forever.
      try {
        await storage().remove(this.root, note.path);
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.emit();
      }
    }
    return { note, wasActive };
  }

  /** Put a deleted note back exactly as it was — the undo half. */
  restoreNote(snapshot: { note: Note; wasActive: boolean }): void {
    this.index.add(snapshot.note);
    this.dirty.add(snapshot.note.id);
    if (snapshot.wasActive) this.activeId = snapshot.note.id;
    this.emit();
    void this.saveAll();
  }

  /** Promote any note into the manuscript: it becomes a chapter and takes
      the next order number. The file stays where it is — moving it would
      break links — only its role changes. */
  convertToChapter(id: string): void {
    const note = this.index.get(id);
    if (!note || note.type === "chapter" || note.type === "scene") return;
    const last = this.orderedChapters().reduce(
      (max, n) => (typeof n.data.order === "number" ? Math.max(max, n.data.order) : max),
      0,
    );
    note.type = "chapter";
    note.data.type = "chapter";
    note.data.order = last + 1;
    this.dirty.add(id);
    this.emit();
  }

  /** Create a note at an exact path — for callers that know where a file
      belongs (agent reports), rather than the type-to-folder guess that
      createFromDanglingLink makes. */
  createNoteAtPath(path: string, raw: string): Note {
    const note = parseNote(path, raw);
    this.index.add(note);
    this.dirty.add(note.id);
    this.emit();
    return note;
  }

  /** Create a fresh note of any type and open it. Chapters and scenes get
      the next order number so they land at the end of the manuscript
      instead of sorting unpredictably among the unordered. */
  createNote(type: string, name: string): Note {
    const note = this.createFromDanglingLink(name, type);
    if (type === "chapter" || type === "scene") {
      const last = this.orderedChapters().reduce(
        (max, n) => (typeof n.data.order === "number" ? Math.max(max, n.data.order) : max),
        0,
      );
      note.data.order = last + 1;
    }
    this.activeId = note.id;
    this.emit();
    return note;
  }

  /** Create a note that was referenced but never written. */
  /* ---------- templates ----------

     A template is an ordinary note living under Templates/ — visible in
     the codex, editable like anything else, and it travels with the
     project folder. `templateFor` in its frontmatter remembers what kind
     of note it stamps out. */

  templates(): Note[] {
    return this.index
      .all()
      .filter((n) => n.path.startsWith("Templates/"))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Copy a note into Templates/. The copy's title gets a "(template)"
      suffix so it never hijacks [[links]] meant for the original. */
  saveAsTemplate(id: string): Note | null {
    const source = this.index.get(id);
    if (!source) return null;
    const title = `${source.title} (template)`;
    const existing = this.index.resolveLink(title);
    if (existing) return existing;
    const filename = title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
    const tpl: Note = {
      id: `tpl-${source.id}`,
      path: `Templates/${filename}.md`,
      type: "note",
      title,
      aliases: [],
      tags: [],
      data: { templateFor: source.type },
      body: source.body,
    };
    this.index.add(tpl);
    this.dirty.add(tpl.id);
    this.emit();
    return tpl;
  }

  /** Stamp out a new note from a template and open it. {{name}} and
      {{date}} in the template body are filled in. */
  createFromTemplate(templateId: string, name: string): Note | null {
    const tpl = this.index.get(templateId);
    if (!tpl) return null;
    const type = typeof tpl.data.templateFor === "string" ? tpl.data.templateFor : "note";
    const note = this.createNote(type, name);
    const today = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    note.body = tpl.body.replaceAll("{{name}}", name).replaceAll("{{date}}", today);
    this.dirty.add(note.id);
    this.emit();
    return note;
  }

  createFromDanglingLink(name: string, type: string): Note {
    const folder =
      type === "character"
        ? "Codex/Characters"
        : type === "location"
          ? "Codex/Locations"
          : type === "chapter"
            ? "Manuscript"
            : type === "prompt"
              ? "Prompts"
              : "Codex/Lore";
    const filename = name.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const note = parseNote(
      `${folder}/${filename}.md`,
      `---\ntype: ${type}\nname: ${name}\n---\n`,
    );
    this.index.add(note);
    this.dirty.add(note.id);
    this.emit();
    return note;
  }
}

export const store = new VaultStore();

/** Re-render on any vault change. */
export function useVaultVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
