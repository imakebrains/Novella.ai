/* Assertions for the personalization schema migration.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   This suite exists because of a specific, expensive failure. The motion
   default was changed from "auto" (follow the OS) to "full" after it came
   out that Windows machines with animation effects switched off report
   prefers-reduced-motion, which silently flattened every animation in the
   app. Changing DEFAULTS fixed nothing for anyone who had already opened
   Novella: loadPersonalization merges `{...DEFAULTS, ...stored}`, and
   those installs had "auto" written into storage explicitly, so the new
   default was merged straight underneath it. The tour clips froze, and
   they froze in a way that reads as broken rather than still.

   The rule being locked down has two halves, and the second matters as
   much as the first: move the value once for people who never chose it,
   and never touch it again for people who did. */

import {
  DEFAULTS,
  loadPersonalization,
  motionBlurOn,
  motionModeOf,
  savePersonalization,
  type Personalization,
} from "./src/ui/personalize";

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

/* ---------------- a localStorage, and a DOM stub ---------------- */

const KEY = "novella.personalize";

const store = new Map<string, string>();
const shim = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

// applyPersonalization touches document and matchMedia; savePersonalization
// calls it. Stub just enough that the storage half can be exercised.
const g = globalThis as Record<string, unknown>;
g.localStorage = shim;
const classes = new Set<string>();
g.document = {
  documentElement: {
    style: { setProperty() {}, removeProperty() {} },
    classList: {
      toggle: (c: string, on?: boolean) => {
        if (on) classes.add(c);
        else classes.delete(c);
      },
      add: (c: string) => void classes.add(c),
      remove: (c: string) => void classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
  },
};
g.window = { matchMedia: () => ({ matches: false }) };

function stored(raw: Personalization | string): void {
  store.set(KEY, typeof raw === "string" ? raw : JSON.stringify(raw));
}

/* ============================================================
   The migration — move it once
   ============================================================ */

// The exact shape found in the owner's real leveldb on 2026-08-20.
stored({
  proseFont: "serif",
  proseSize: 14,
  leading: 1.4,
  measure: "standard",
  corners: "rounded",
  motion: "auto",
  accent: "#c65f4a",
  bgImage: "preset:alpine",
  glowMode: "off",
} as Personalization);

const real = loadPersonalization();
check("a pre-migration install stops following the OS", real.motion, "full");
check("the migration stamps the schema", real.v, 2);
check("nothing else is disturbed — accent", real.accent, "#c65f4a");
check("nothing else is disturbed — backdrop", real.bgImage, "preset:alpine");
check("nothing else is disturbed — prose size", real.proseSize, 14);
check("nothing else is disturbed — glow", real.glowMode, "off");
check("the effective mode really is full", motionModeOf(real), "full");

// An install with no motion key at all is the same case: absent read as
// "auto" everywhere before this change.
stored({ accent: "#123456" } as Personalization);
check("an install with no motion key gets full", loadPersonalization().motion, "full");

check("empty storage lands on the defaults", (() => {
  store.clear();
  return loadPersonalization().motion;
})(), DEFAULTS.motion);

check("unparseable storage does not throw", (() => {
  stored("{not json");
  return loadPersonalization().motion;
})(), "full");

/* ============================================================
   ...and never again

   Someone who genuinely needs stillness chooses Follow system. The
   migration must not quietly undo that on the next launch, which is
   exactly what a version-less "if auto then full" rule would do.
   ============================================================ */

stored({ motion: "auto", v: 2 } as Personalization);
check("a deliberate Follow system is left alone", loadPersonalization().motion, "auto");

stored({ motion: "minimal" } as Personalization);
check("minimal is never touched", loadPersonalization().motion, "minimal");

stored({ motion: "full", v: 2 } as Personalization);
check("full stays full", loadPersonalization().motion, "full");

// The round trip is what makes the stamp real: choosing Follow system
// after the migration has to survive a reload.
store.clear();
const chosen = { ...loadPersonalization(), motion: "auto" as const };
savePersonalization(chosen);
check("choosing Follow system survives a reload", loadPersonalization().motion, "auto");
ok("the saved blob carries the stamp", (JSON.parse(store.get(KEY)!) as Personalization).v === 2);

/* ============================================================
   Motion blur
   ============================================================ */

store.clear();
ok("motion blur is on by default", motionBlurOn(loadPersonalization()));

stored({ motionBlur: false } as Personalization);
ok("motion blur can be turned off", !motionBlurOn(loadPersonalization()));
check("turning off motion blur leaves motion alone", loadPersonalization().motion, "full");

stored({ motionBlur: true, v: 2 } as Personalization);
ok("motion blur can be turned back on", motionBlurOn(loadPersonalization()));

// Off is a class, not a zero-length blur: a 0px backdrop-filter still
// promotes a layer and still creates a stacking context, which is how the
// backdrop once covered the whole app.
store.clear();
savePersonalization({ ...loadPersonalization(), motionBlur: false });
ok("no-motion-blur reaches the document", classes.has("no-motion-blur"));
savePersonalization({ ...loadPersonalization(), motionBlur: true });
ok("and comes back off again", !classes.has("no-motion-blur"));

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`personalize tests: ${checks} checks passed`);
