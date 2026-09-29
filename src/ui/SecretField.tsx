import { useState } from "react";
import type { SettingField } from "../core/plugins";
import { isTauri } from "../storage";
import { isSaved, secretFieldView, type SettingsHandle } from "./secretFieldCore";

/* A plugin's secret setting, shown without ever holding the saved key.
   Write-through per keystroke, as the plain rows do, so "type to
   replace" is literal: the first character typed replaces the key.
   This file must never read a stored value with a get call — the source
   scan in test-secretfield.ts holds it to that. */
export function SecretField({
  settings,
  field,
  className,
}: {
  settings: SettingsHandle;
  field: SettingField;
  className: string;
}) {
  const [draft, setDraft] = useState("");
  // Recomputed every render rather than held in state: the keychain
  // hydrates asynchronously after register, and a boolean re-read is free.
  const view = secretFieldView(isSaved(settings, field), draft, isTauri(), field.placeholder);

  // An empty write is a delete — on desktop ScopedSettings turns it into
  // secret_delete, so Clear really removes the key from the keychain.
  const commit = (next: string) => {
    setDraft(next);
    settings.set(field.key, next);
  };

  return (
    <div className="secret-field">
      <input
        className={className}
        type="password"
        value={view.value}
        placeholder={view.placeholder}
        onChange={(e) => commit(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-label={field.label}
      />
      {view.canClear && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => commit("")}
          title={isTauri() ? "Delete it from your OS credential manager" : "Forget it for this session"}
        >
          Clear
        </button>
      )}
    </div>
  );
}
