import type { SettingField } from "../core/plugins";

/* ============================================================
   What a plugin settings row may show for a secret field.
   CLAUDE.md: an API key is "never logged, never rendered back".
   The moment a saved key sits in an input's `value` it is readable
   to devtools, to every extension on the page and to anyone who
   flips a reveal toggle — and the form never needed it: all it has
   to know is whether one exists. So the read collapses to a boolean
   here, before any component sees it, and the view has no parameter
   through which a stored key could arrive.
   Pure on purpose (no React, no isTauri) so test-secretfield.ts can
   prove it; named *Core rather than secretField.ts because that
   would differ from SecretField.tsx only by case, and the owner's
   Windows checkout cannot hold both.
   ============================================================ */

/** The shape pluginHost.settingsFor() hands back. */
export interface SettingsHandle {
  get(k: string): unknown;
  set(k: string, v: unknown): void;
}

export function hasSavedSecret(stored: unknown): boolean {
  return typeof stored === "string" && stored.trim() !== "";
}

/** The one place the UI touches a stored secret — and only as a yes/no. */
export function isSaved(settings: SettingsHandle, field: SettingField): boolean {
  return hasSavedSecret(settings.get(field.key));
}

/** A row's starting value. A secret is refused before the read, not
    after, so it never even passes through a component's state. */
export function readPlain(settings: SettingsHandle, field: SettingField): string {
  if (field.secret) return "";
  const v = settings.get(field.key);
  return v === undefined || v === null ? "" : String(v);
}

export interface SecretView {
  value: string;
  placeholder: string;
  canClear: boolean;
}

/* `draft` is the writer's own keystrokes since this row mounted —
   never a stored value — so echoing it is echoing what they can
   already see on their own keyboard. */
export function secretFieldView(
  hasSaved: boolean,
  draft: string,
  desktop: boolean,
  fallback?: string,
): SecretView {
  return {
    value: draft,
    placeholder: hasSaved
      ? desktop
        ? "Saved in your keychain — type to replace"
        : "Saved for this session — type to replace"
      : fallback || "Paste your key",
    canClear: hasSaved,
  };
}
