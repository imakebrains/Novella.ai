import { useEffect, useState } from "react";
import type { NovellaPlugin, SettingField } from "../core/plugins";
import { pluginHost, usePluginVersion } from "../plugins/runtime";
import { SetupPanel } from "./SetupPanel";
import { THEMES, useTheme } from "./useTheme";
import { useProfile } from "../state/profile";
import { SessionSummary } from "./GoalMeter";
import { activeProviderSlash, setActiveProvider } from "../ai/generate";
import { PRESETS, listRemoteModels } from "../plugins/providers/openaiCompatible";
import { useMusic } from "../state/music";
import {
  checkForUpdate,
  currentVersion,
  setUpdateRepo,
  updateRepo,
  type UpdateCheck,
} from "../state/updates";
import { AgentsPanel } from "./AgentsPanel";

/* Settings.

   Tabbed rather than one long scroll, because "where do I change my pen
   name" and "which model am I using" are different errands.

   There is no account tab. Novella has no server, so a login would be
   theatre — see SECURITY.md. Profile is local metadata for title pages. */

type Tab = "profile" | "appearance" | "connections" | "agents" | "plugins" | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "connections", label: "Connections" },
  { id: "agents", label: "Agents" },
  { id: "plugins", label: "Plugins" },
  { id: "about", label: "About" },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  usePluginVersion();
  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="settings-layout">
          <nav className="settings-nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`settings-nav-item ${tab === t.id ? "on" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="modal-body">
            {tab === "profile" && <ProfileTab />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "connections" && <ConnectionsTab />}
            {tab === "agents" && <AgentsPanel onOpenNote={onClose} />}
            {tab === "plugins" && <PluginsTab />}
            {tab === "about" && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- profile ---------------- */

function ProfileTab() {
  const [profile, update] = useProfile();

  return (
    <>
      <p className="hint">
        Used on title pages and exports. Stored on this machine only — Novella has no
        account system and nothing here is ever sent anywhere.
      </p>

      <Field label="Author name">
        <input
          className="search bare"
          value={profile.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="For the copyright line"
        />
      </Field>

      <Field label="Pen name">
        <input
          className="search bare"
          value={profile.penName}
          onChange={(e) => update({ penName: e.target.value })}
          placeholder="If you publish under a different name"
        />
      </Field>

      <Field label="Website">
        <input
          className="search bare"
          value={profile.website}
          onChange={(e) => update({ website: e.target.value })}
          placeholder="Optional, for front matter"
        />
      </Field>

      <Field label="Default POV">
        <select
          className="select bare"
          value={profile.defaultPov}
          onChange={(e) => update({ defaultPov: e.target.value as typeof profile.defaultPov })}
        >
          <option value="unset">Not set</option>
          <option value="third-limited">Third person limited</option>
          <option value="first">First person</option>
          <option value="third-omniscient">Third person omniscient</option>
        </select>
      </Field>

      <Field label="Daily goal">
        <input
          className="search bare"
          type="number"
          min={0}
          step={100}
          value={profile.dailyGoal || ""}
          onChange={(e) => update({ dailyGoal: Number(e.target.value) || 0 })}
          placeholder="Words per day, blank for none"
        />
      </Field>

      <div className="settings-section-label">Your writing</div>
      <SessionSummary />
      <p className="hint">
        Counts net words added to the manuscript — a day spent cutting still counts as work,
        so the bar can dip below zero and that's honest. Nothing here leaves your machine.
      </p>
    </>
  );
}

/* ---------------- appearance ---------------- */

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <p className="hint">
        Five worlds rather than a light switch. Pick whichever suits what you're writing.
      </p>

      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-card ${theme === t.id ? "on" : ""}`}
            onClick={() => setTheme(t.id)}
            aria-pressed={theme === t.id}
          >
            <span className="theme-preview" style={{ background: t.swatch[0] }}>
              <span className="theme-preview-pane" style={{ background: t.swatch[1] }} />
              <span className="theme-preview-accent" style={{ background: t.swatch[2] }} />
            </span>
            <span className="theme-name">{t.name}</span>
            <span className="theme-blurb">{t.blurb}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------------- connections ---------------- */

/* One place for everything Novella talks to: AI models, music, the update
   channel — and honest placeholders for what isn't wired yet. The card
   grid answers "what's connected?" at a glance; details live below. */

function ConnectionsTab() {
  usePluginVersion();
  const { url: musicUrl } = useMusic();
  const active = activeProviderSlash();

  const cards: { name: string; detail: string; on: boolean; note?: string }[] = [
    {
      name: "Local AI (Ollama)",
      detail: pluginHost.isActive("provider-ollama-streaming")
        ? active === "/local"
          ? "Connected · writing model"
          : "Connected"
        : "Off",
      on: pluginHost.isActive("provider-ollama-streaming"),
    },
    {
      name: "Claude",
      detail: pluginHost.isActive("provider-anthropic")
        ? active === "/claude"
          ? "Connected · writing model"
          : "Connected"
        : "Not linked",
      on: pluginHost.isActive("provider-anthropic"),
    },
    {
      name: "ChatGPT & compatible",
      detail: pluginHost.isActive("provider-openai-compatible")
        ? active === "/custom"
          ? "Connected · writing model"
          : "Connected"
        : "Not linked",
      on: pluginHost.isActive("provider-openai-compatible"),
    },
    {
      name: "Music",
      detail: musicUrl ? "Playlist saved with this project" : "None — set one in the ♪ dock",
      on: !!musicUrl,
    },
    {
      name: "GitHub updates",
      detail: updateRepo() ? updateRepo() : "No repository set",
      on: !!updateRepo(),
    },
    {
      name: "Google account",
      detail: "Arrives with sync — nothing to link yet",
      on: false,
      note: "planned",
    },
  ];

  return (
    <>
      <div className="connection-cards">
        {cards.map((c) => (
          <div key={c.name} className={`connection-card ${c.on ? "on" : ""}`}>
            <span className={`connection-dot ${c.on ? "on" : ""} ${c.note ? "planned" : ""}`} />
            <span className="connection-name">{c.name}</span>
            <span className="connection-detail">{c.detail}</span>
          </div>
        ))}
      </div>

      <UpdatesSection />
      <ProvidersSection />
    </>
  );
}

/* ---------------- updates ---------------- */

function UpdatesSection() {
  const [repo, setRepo] = useState(updateRepo());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setUpdateRepo(repo);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await checkForUpdate());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-group">
      <h3 className="settings-cat">App updates</h3>
      <p className="hint">
        Novella {currentVersion()}. Point this at the app's GitHub repository and updates
        are checked and fetched from its releases — no visiting the site.
      </p>
      <div className="music-input-row">
        <input
          className="search bare"
          value={repo}
          placeholder="owner/repository"
          onChange={(e) => setRepo(e.target.value)}
          aria-label="GitHub repository for updates"
        />
        <button className="btn-ghost" onClick={() => void check()} disabled={busy}>
          {busy ? "Checking…" : "Check for updates"}
        </button>
      </div>
      {error && <p className="hint music-error">{error}</p>}
      {result &&
        (result.newer ? (
          <div className="notice update-notice">
            <span>
              {result.latest} is out — you're on {result.current}.
            </span>
            <a
              className="btn-primary update-link"
              href={result.downloadUrl ?? result.releaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              {result.downloadUrl ? "Download update" : "Open release"}
            </a>
          </div>
        ) : (
          <p className="hint">
            Up to date — {result.current} is the latest release.
          </p>
        ))}
    </section>
  );
}

function ProvidersSection() {
  const providers = pluginHost.providers();
  const [active, setActive] = useState(activeProviderSlash());
  const [probe, setProbe] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);

  const custom = pluginHost.list().find((p) => p.id === "provider-openai-compatible");
  const customSettings = pluginHost.settingsFor("provider-openai-compatible");

  const testCustom = async () => {
    setProbe("Checking…");
    setModels(null);
    try {
      const found = await listRemoteModels(
        String(customSettings.get("baseUrl") ?? "https://api.openai.com/v1"),
        String(customSettings.get("apiKey") ?? ""),
      );
      setModels(found);
      setProbe(`Connected · ${found.length} models available`);
    } catch (err) {
      setProbe(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <section className="settings-group">
        <h3 className="settings-cat">Local AI</h3>
        <SetupPanel />
      </section>

      <section className="settings-group">
        <h3 className="settings-cat">Which model writes</h3>
        {providers.length === 0 ? (
          <p className="hint">No providers are on. Enable one under Plugins.</p>
        ) : (
          <div className="radio-list">
            {providers.map(({ slash, pluginId }) => {
              const plugin = pluginHost.list().find((p) => p.id === pluginId);
              return (
                <label key={slash} className={`radio-row ${active === slash ? "on" : ""}`}>
                  <input
                    type="radio"
                    name="active-provider"
                    checked={active === slash}
                    onChange={() => {
                      setActiveProvider(slash);
                      setActive(slash);
                    }}
                  />
                  <span className="radio-text">
                    <span className="radio-label">{plugin?.name ?? slash}</span>
                    <span className="radio-detail">{slash}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {custom && (
        <section className="settings-group">
          <h3 className="settings-cat">Custom endpoint</h3>
          <p className="hint">
            Anything speaking the OpenAI API works — OpenRouter, Groq, DeepSeek, LM Studio,
            or a service that doesn't exist yet.
          </p>

          {/* The toggle lives here, next to the settings it governs. Making
              people find it on another tab before their endpoint could be
              selected above was a trap. */}
          <div className="setting">
            <label className="setting-label">Enabled</label>
            <label className="switch">
              <input
                type="checkbox"
                checked={pluginHost.isActive(custom.id)}
                onChange={(e) => {
                  if (e.target.checked) void pluginHost.enable(custom.id);
                  else pluginHost.disable(custom.id);
                }}
              />
              <span className="switch-track" />
            </label>
          </div>

          <Field label="Preset">
            <select
              className="select bare"
              defaultValue=""
              onChange={(e) => {
                const preset = PRESETS.find((p) => p.baseUrl === e.target.value);
                if (preset) customSettings.set("baseUrl", preset.baseUrl);
              }}
            >
              <option value="">Choose a service…</option>
              {PRESETS.map((p) => (
                <option key={p.baseUrl} value={p.baseUrl}>
                  {p.label} — {p.note}
                </option>
              ))}
            </select>
          </Field>

          {custom.settingsSchema?.map((f) => (
            <SettingRow key={f.key} pluginId={custom.id} field={f} />
          ))}

          <div className="btn-row">
            <button className="btn-ghost" onClick={() => void testCustom()}>
              Test connection
            </button>
          </div>
          {probe && <p className="hint">{probe}</p>}
          {models && models.length > 0 && (
            <div className="chips">
              {models.slice(0, 24).map((m) => (
                <button
                  key={m}
                  className="chip"
                  onClick={() => customSettings.set("model", m)}
                  title="Use this model"
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <p className="hint modal-footnote">
        API keys are held in memory for this session only and never written to disk. That
        means re-entering them each launch until OS keychain storage lands.
      </p>
    </>
  );
}

/* ---------------- plugins ---------------- */

const CATEGORY_LABEL: Record<string, string> = {
  ai: "AI providers",
  grammar: "Grammar & style",
  plagiarism: "Plagiarism",
  import: "Import",
  capture: "Capture",
  export: "Export",
};

function PluginsTab() {
  const plugins = pluginHost.list();
  const byCategory = new Map<string, NovellaPlugin[]>();
  for (const p of plugins) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  if (plugins.length === 0) return <p className="hint">No plugins registered.</p>;

  return (
    <>
      <p className="hint">
        Plugins extend what Novella can do; <strong>Connections</strong> (previous tab) is
        where outside services link in — AI models, music platforms, GitHub updates.
        Anything that speaks the OpenAI API can already be connected as a custom
        endpoint. Google accounts, Drive and Dropbox arrive with the sync backend:
        they need server-side pieces we haven't built yet, and a fake "link" button
        would only pretend otherwise.
      </p>

      {[...byCategory.entries()].map(([category, list]) => (
        <section key={category} className="settings-group">
          <h3 className="settings-cat">{CATEGORY_LABEL[category] ?? category}</h3>
          {list.map((p) => (
            <PluginRow key={p.id} plugin={p} />
          ))}
        </section>
      ))}
    </>
  );
}

function PluginRow({ plugin }: { plugin: NovellaPlugin }) {
  const active = pluginHost.isActive(plugin.id);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`plugin-row ${active ? "on" : ""}`}>
      <div className="plugin-head">
        <label className="switch">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => {
              if (e.target.checked) void pluginHost.enable(plugin.id);
              else pluginHost.disable(plugin.id);
              setExpanded(e.target.checked);
            }}
          />
          <span className="switch-track" />
        </label>

        <div className="plugin-meta">
          <div className="plugin-name">
            {plugin.name}
            {plugin.firstRunDownload && (
              <span className="chip download">
                ~{Math.round(plugin.firstRunDownload.sizeMB)} MB on first use
              </span>
            )}
          </div>
          <div className="plugin-desc">{plugin.description}</div>
        </div>

        {plugin.settingsSchema?.length ? (
          <button
            className="icon-btn"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Hide settings" : "Show settings"}
          >
            {expanded ? "▴" : "▾"}
          </button>
        ) : null}
      </div>

      {expanded && plugin.settingsSchema?.length ? (
        <div className="plugin-settings">
          {plugin.settingsSchema.map((field) => (
            <SettingRow key={field.key} pluginId={plugin.id} field={field} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- about ---------------- */

function AboutTab() {
  return (
    <>
      <p className="hint">
        <strong>Novella</strong> — a local-first writing environment. Your book is a folder
        of Markdown files on your disk. It works offline, and it outlives this app.
      </p>
      <Field label="Version">
        <span className="about-value">0.1.0</span>
      </Field>
      <Field label="Your data">
        <span className="about-value">
          Stays on this machine. No telemetry, no analytics, no account.
        </span>
      </Field>
      <Field label="AI">
        <span className="about-value">
          Local by default. Anything you send to a custom endpoint goes to that provider
          under their terms, not ours.
        </span>
      </Field>
    </>
  );
}

/* ---------------- shared ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting">
      <label className="setting-label">{label}</label>
      {children}
    </div>
  );
}

function SettingRow({ pluginId, field }: { pluginId: string; field: SettingField }) {
  const settings = pluginHost.settingsFor(pluginId);
  const [value, setValue] = useState<string>(() => {
    const v = settings.get(field.key);
    return v === undefined || v === null ? "" : String(v);
  });

  const commit = (next: string) => {
    setValue(next);
    settings.set(field.key, field.kind === "number" ? Number(next) : next);
  };

  return (
    <div className="setting">
      <label className="setting-label">
        {field.label}
        {field.secret && <span className="chip secret">session only</span>}
      </label>

      {field.kind === "select" ? (
        <select className="select bare" value={value} onChange={(e) => commit(e.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.kind === "toggle" ? (
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => commit(String(e.target.checked))}
        />
      ) : (
        <input
          className="search bare"
          type={field.kind === "password" ? "password" : field.kind === "number" ? "number" : "text"}
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => commit(e.target.value)}
          autoComplete={field.secret ? "off" : undefined}
        />
      )}
    </div>
  );
}
