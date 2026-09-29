/* Assertions for re-granting a remembered vault — src/storage/reauthorize.ts.

   Same shape as test-units.ts and test-storage.ts: silent unless something
   is wrong, non-zero exit when it is.

   The Rust half (the record, the canonical comparison, the config-dir
   fence) is proved by `cargo test` in src-tauri. What is worth proving
   here is the webview's side of the bargain:

   • A known folder costs one bridge call and never shows a dialog —
     launch reopen must stay silent for a writer who has already
     confirmed.
   • Only the "not a folder you chose" refusal earns a confirmation. A
     moved folder must not throw a picker at the writer at launch.
   • A cancelled or wrong pick fails with the original refusal, so the
     message still points at Projects → Open a folder…
   • Confirmations never overlap. Launch, a banner write and a preview
     can ask for the same root at once; one dialog, not three.
   • The phrase matched here really is in lib.rs. A rewording on the Rust
     side would otherwise switch the whole migration off without a single
     failing test. */

import { readFileSync } from "node:fs";
import { UNCHOSEN_FOLDER, isUnchosenFolderRefusal, vaultGranter } from "./src/storage/reauthorize";

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

/* ---------- a fake bridge that behaves like lib.rs ---------- */

interface FakeOptions {
  known?: string[];
  missing?: string[];
  /** What each successive picker returns; undefined = cancelled. */
  picks?: (string | undefined)[];
}

function fakeBridge(opts: FakeOptions) {
  const known = new Set(opts.known ?? []);
  const missing = new Set(opts.missing ?? []);
  const picks = [...(opts.picks ?? [])];
  const calls: string[] = [];
  let open = 0;
  let maxOpen = 0;

  const covered = (path: string) =>
    [...known].some((k) => path === k || path.startsWith(`${k}/`));

  const invoke = async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
    const path = String(args?.path ?? args?.defaultPath ?? "");
    calls.push(`${cmd}:${path}`);
    if (cmd === "allow_vault") {
      if (missing.has(path)) throw `Novella can't find the folder ${path}.`;
      if (!covered(path)) throw `Novella won't open ${path}: it ${UNCHOSEN_FOLDER}.`;
      return null;
    }
    if (cmd === "pick_vault_folder") {
      open++;
      maxOpen = Math.max(maxOpen, open);
      // A real dialog waits for the writer; yield so overlapping callers
      // would get their chance to open a second one if the queue failed.
      await new Promise((r) => setTimeout(r, 5));
      open--;
      const picked = picks.shift();
      if (picked === undefined) return null;
      known.add(picked);
      return picked;
    }
    throw new Error(`unexpected command ${cmd}`);
  };

  return { invoke, calls, maxOpen: () => maxOpen };
}

async function outcome(p: Promise<void>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (err) {
    return typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  }
}

/* ---------- classifier ---------- */

function classifier(): void {
  ok("refusal as a string", isUnchosenFolderRefusal(`Novella won't open C:\\: it ${UNCHOSEN_FOLDER}.`));
  ok("refusal as an Error", isUnchosenFolderRefusal(new Error(`x ${UNCHOSEN_FOLDER} y`)));
  ok("missing folder is not a refusal", !isUnchosenFolderRefusal("Novella can't find the folder /a."));
  ok("undefined is not a refusal", !isUnchosenFolderRefusal(undefined));
  ok("an object is not a refusal", !isUnchosenFolderRefusal({ message: UNCHOSEN_FOLDER }));
}

/* ---------- the Rust side really says it ---------- */

function phraseMatchesRust(): void {
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  ok("lib.rs's allow_vault refusal carries the matched phrase", lib.includes(UNCHOSEN_FOLDER));
  ok("lib.rs registers pick_vault_folder", /generate_handler!\[[^\]]*pick_vault_folder/.test(lib));
  const ts = readFileSync("src/storage/tauriStorage.ts", "utf8");
  ok("tauriStorage no longer opens the JS folder dialog", !ts.includes("plugin-dialog"));
}

/* ---------- granter ---------- */

async function granter(): Promise<void> {
  {
    const b = fakeBridge({ known: ["/w/novel"] });
    check("known: resolves", await outcome(vaultGranter(b.invoke)("/w/novel")), "ok");
    check("known: one call, no dialog", b.calls, ["allow_vault:/w/novel"]);
  }
  {
    const b = fakeBridge({ known: ["/w/novel"] });
    check("inside a known folder: resolves", await outcome(vaultGranter(b.invoke)("/w/novel/ch")), "ok");
    check("inside a known folder: no dialog", b.calls.length, 1);
  }
  {
    const b = fakeBridge({ missing: ["/w/gone"] });
    const r = await outcome(vaultGranter(b.invoke)("/w/gone"));
    ok("missing: rejects with the can't-find message", r.includes("can't find"));
    check("missing: never offers a picker", b.calls, ["allow_vault:/w/gone"]);
  }
  {
    const b = fakeBridge({ picks: ["/w/old"] });
    check("unconfirmed then confirmed: resolves", await outcome(vaultGranter(b.invoke)("/w/old")), "ok");
    check("unconfirmed: picker starts in the project's own folder", b.calls, [
      "allow_vault:/w/old",
      "allow_vault:/w/old",
      "pick_vault_folder:/w/old",
      "allow_vault:/w/old",
    ]);
  }
  {
    const b = fakeBridge({ picks: [undefined] });
    const r = await outcome(vaultGranter(b.invoke)("/w/old"));
    ok("cancelled: rejects with the original refusal", r.includes(UNCHOSEN_FOLDER) && r.includes("/w/old"));
    check("cancelled: exactly one dialog", b.calls.filter((c) => c.startsWith("pick")).length, 1);
  }
  {
    const b = fakeBridge({ picks: ["/w/elsewhere"] });
    const r = await outcome(vaultGranter(b.invoke)("/w/old"));
    ok("wrong folder picked: still refused", r.includes(UNCHOSEN_FOLDER));
  }
  {
    // Picking the parent covers the project — Rust's rule, mirrored here.
    const b = fakeBridge({ picks: ["/w"] });
    check("parent picked: covers the project", await outcome(vaultGranter(b.invoke)("/w/old")), "ok");
  }
  {
    // Launch, banner and preview all asking for one unconfirmed root.
    const b = fakeBridge({ picks: ["/w/old"] });
    const grant = vaultGranter(b.invoke);
    const results = await Promise.all([grant("/w/old"), grant("/w/old"), grant("/w/old")].map(outcome));
    check("same root thrice: all resolve", results, ["ok", "ok", "ok"]);
    check("same root thrice: one dialog", b.calls.filter((c) => c.startsWith("pick")).length, 1);
    check("same root thrice: dialogs never overlap", b.maxOpen(), 1);
  }
  {
    const b = fakeBridge({ picks: ["/w/a", "/w/b"] });
    const grant = vaultGranter(b.invoke);
    const results = await Promise.all([grant("/w/a"), grant("/w/b")].map(outcome));
    check("two roots: both resolve", results, ["ok", "ok"]);
    check("two roots: one dialog each", b.calls.filter((c) => c.startsWith("pick")).length, 2);
    check("two roots: dialogs never overlap", b.maxOpen(), 1);
  }
  {
    // A cancel must not wedge the queue for whoever is next.
    const b = fakeBridge({ picks: [undefined, "/w/b"] });
    const grant = vaultGranter(b.invoke);
    const results = await Promise.all([grant("/w/a"), grant("/w/b")].map(outcome));
    ok("cancel then next: first rejects", results[0] !== "ok");
    check("cancel then next: second still resolves", results[1], "ok");
  }
}

/* ---------- report ---------- */

void (async () => {
  classifier();
  phraseMatchesRust();
  await granter();

  if (failures > 0) {
    console.error(`\n${failures} of ${checks} checks FAILED`);
    process.exit(1);
  }
  console.log(`vaultscope tests: ${checks} checks passed`);
})();
