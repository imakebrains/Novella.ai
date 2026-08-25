/* Assertions for the plugin host — the thing that runs other people's code.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   This suite exists because of what the host DOES rather than how big it
   is. Every other module here is asked to compute something; this one
   registers behaviour, activates it, and wires AI providers into the app.
   When it leaks — a disabled plugin whose provider still answers, a
   command that outlives the plugin that added it — nothing throws. The
   app just quietly keeps running code the writer switched off, which is
   the worst shape a bug can take in a component like this.

   The audit that prompted this listed agentRunner alongside it. That was
   a filename match rather than a real gap: the scheduling decision,
   agentIsDue, already has fourteen assertions in test-units.ts — they
   just import from agents.ts, so a search for "agentRunner" missed them. */

import { PluginHost } from "./src/plugins/runtime";
import type { NovellaPlugin, PluginContext } from "./src/core/plugins";

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

/* ---------------- a localStorage, since the host persists ---------------- */

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

/* ---------------- fixtures ---------------- */

interface Trace {
  activated: number;
  deactivated: number;
}

function makePlugin(id: string, trace: Trace, slash?: string): NovellaPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    category: "ai",
    description: "A fixture.",
    onEnable(ctx: PluginContext) {
      trace.activated++;
      ctx.registerCommand({ id: `${id}.hello`, label: `Hello from ${id}`, run: () => {} });
      if (slash) {
        ctx.registerProvider({
          slash,
          name: `${id} provider`,
          async complete() {
            return "";
          },
        } as never);
      }
    },
    onDisable() {
      trace.deactivated++;
    },
  } as unknown as NovellaPlugin;
}

const fresh = () => {
  store.clear();
  return new PluginHost();
};

/* ============================================================
   Registration is not activation
   ============================================================ */

{
  const host = fresh();
  const t: Trace = { activated: 0, deactivated: 0 };
  host.register(makePlugin("a", t));

  check("a registered plugin is listed", host.list().length, 1);
  ok("but it is not active until enabled", !host.isActive("a"));
  check("and it has not run", t.activated, 0);
  check("a plugin that never activated adds no commands", host.allCommands().length, 0);
}

/* ============================================================
   Enable and disable

   The disable path is the one that matters. A plugin the writer switched
   off must stop being reachable by every route it registered — not just
   disappear from a list.
   ============================================================ */

{
  const host = fresh();
  const t: Trace = { activated: 0, deactivated: 0 };
  host.register(makePlugin("a", t, "aa"));
  await host.enable("a");

  ok("enabling activates it", host.isActive("a"));
  check("activate ran exactly once", t.activated, 1);
  ok("its command is reachable", host.allCommands().some((c) => c.id === "a.hello"));
  ok("its provider is reachable", host.provider("aa") !== undefined);
  check("and is attributed to it", host.providers()[0]?.pluginId, "a");

  host.disable("a");

  ok("disabling deactivates it", !host.isActive("a"));
  check("deactivate ran", t.deactivated, 1);
  check("its commands are gone", host.allCommands().filter((c) => c.id === "a.hello").length, 0);
  check("its provider is gone", host.provider("aa"), undefined);
  check("and is not listed", host.providers().length, 0);
  ok("but the plugin is still registered, ready to re-enable", host.list().length === 1);
}

/* ============================================================
   Disabling one plugin must not disturb another

   Provider cleanup walks an ownership map. A cleanup keyed on the wrong
   thing takes every provider down with it, and the symptom is another
   plugin's AI silently not answering.
   ============================================================ */

{
  const host = fresh();
  const ta: Trace = { activated: 0, deactivated: 0 };
  const tb: Trace = { activated: 0, deactivated: 0 };
  host.register(makePlugin("a", ta, "aa"));
  host.register(makePlugin("b", tb, "bb"));
  await host.enable("a");
  await host.enable("b");

  check("both providers are up", host.providers().length, 2);

  host.disable("a");

  check("only the disabled one's provider went", host.providers().length, 1);
  ok("the survivor is the right one", host.provider("bb") !== undefined);
  check("and the other is untouched", tb.deactivated, 0);
  ok("its command still works", host.allCommands().some((c) => c.id === "b.hello"));
}

/* ============================================================
   Enabling twice must not double anything
   ============================================================ */

{
  const host = fresh();
  const t: Trace = { activated: 0, deactivated: 0 };
  host.register(makePlugin("a", t));
  await host.enable("a");
  await host.enable("a");

  check("activate does not run twice", t.activated, 1);
  check("commands are not duplicated", host.allCommands().filter((c) => c.id === "a.hello").length, 1);
}

/* ============================================================
   Nothing here may throw on a plugin that does not exist
   ============================================================ */

{
  const host = fresh();
  let threw = false;
  try {
    await host.enable("nope");
    host.disable("nope");
  } catch {
    threw = true;
  }
  ok("enabling and disabling an unknown id is a no-op, not a crash", !threw);
  check("and registers nothing", host.list().length, 0);
}

/* ============================================================
   The enabled set survives a restart
   ============================================================ */

{
  const host = fresh();
  const t: Trace = { activated: 0, deactivated: 0 };
  host.register(makePlugin("a", t));
  await host.enable("a");

  // A new host over the same storage is what a restart looks like.
  const t2: Trace = { activated: 0, deactivated: 0 };
  const restarted = new PluginHost();
  restarted.register(makePlugin("a", t2));

  // register() kicks enable() off without awaiting it — onEnable may be
  // async, so activation lands a microtask later. Nothing in the app
  // observes it synchronously (React re-renders on emit), but a test that
  // asserts immediately is asserting the wrong instant.
  await Promise.resolve();

  ok("a plugin enabled before the restart comes back enabled", restarted.isActive("a"));
  check("and activates once on the way up", t2.activated, 1);
}

/* ============================================================
   A plugin that misbehaves must not take the host with it

   This is the whole reason the suite exists. onEnable was called
   unguarded and a throw part way through left the wreckage registered:
   the writer saw the plugin as off while its provider still answered.
   ============================================================ */

{
  const host = fresh();
  const bad = {
    id: "bad",
    name: "Bad plugin",
    category: "ai",
    description: "Has no onEnable at all.",
  } as unknown as NovellaPlugin;

  host.register(bad);
  let threw = false;
  try {
    await host.enable("bad");
  } catch {
    threw = true;
  }
  ok("a plugin with no onEnable does not throw out of enable()", !threw);
  ok("and is not marked active", !host.isActive("bad"));
  ok("the writer is told why", host.recentNotices().some((n) => /onEnable/i.test(n.message)));
}

{
  const host = fresh();
  // Registers a provider and a command, THEN throws — the partial
  // activation that used to leak.
  const halfway = {
    id: "halfway",
    name: "Halfway plugin",
    category: "ai",
    description: "Throws after registering.",
    onEnable(ctx: PluginContext) {
      ctx.registerCommand({ id: "halfway.go", label: "Go", run: () => {} });
      ctx.registerProvider({ slash: "hw", name: "hw" } as never);
      throw new Error("boom");
    },
  } as unknown as NovellaPlugin;

  host.register(halfway);
  let threw = false;
  try {
    await host.enable("halfway");
  } catch {
    threw = true;
  }
  ok("a throwing onEnable is contained", !threw);
  ok("the plugin is not active", !host.isActive("halfway"));
  check("its provider was cleaned up", host.provider("hw"), undefined);
  check("its command was cleaned up", host.allCommands().filter((c) => c.id === "halfway.go").length, 0);
  ok("and the failure is surfaced, not swallowed", host.recentNotices().some((n) => /boom/.test(n.message)));
}

{
  // A bad plugin must not disturb a good one that is already running.
  const host = fresh();
  const good: Trace = { activated: 0, deactivated: 0 };
  host.register(makePlugin("good", good, "gd"));
  await host.enable("good");

  const bad = {
    id: "bad2", name: "Bad two", category: "ai", description: "throws",
    onEnable() { throw new Error("nope"); },
  } as unknown as NovellaPlugin;
  host.register(bad);
  await host.enable("bad2");

  ok("the good plugin is still active", host.isActive("good"));
  ok("its provider still answers", host.provider("gd") !== undefined);
  ok("and its command survives", host.allCommands().some((c) => c.id === "good.hello"));
}

/* ============================================================
   Subscribers are told, and can leave
   ============================================================ */

{
  const host = fresh();
  let calls = 0;
  const off = host.subscribe(() => {
    calls++;
  });
  const before = host.getSnapshot();
  host.register(makePlugin("a", { activated: 0, deactivated: 0 }));

  ok("registering notifies", calls > 0);
  ok("and moves the snapshot, so React re-renders", host.getSnapshot() !== before);

  const at = calls;
  off();
  host.register(makePlugin("b", { activated: 0, deactivated: 0 }));
  check("unsubscribing actually stops the calls", calls, at);
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`plugin host tests: ${checks} checks passed`);
