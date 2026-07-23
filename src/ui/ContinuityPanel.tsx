import { useMemo } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { checkContinuity, type ContinuityFinding } from "../analysis/continuity";

/* The continuity tab — the deterministic tier.

   Everything here is provable from the files: no model, no maybes. The
   trade is coverage for trust — a finding is always worth clicking. */

const KIND_LABEL: Record<ContinuityFinding["kind"], string> = {
  "early-mention": "On stage before their entrance",
  "duplicate-name": "Possible duplicate entries",
  dangling: "Named but never written",
  unordered: "Chapters without a place",
  "pov-unknown": "POV the codex doesn't know",
};

const KIND_ORDER: ContinuityFinding["kind"][] = [
  "early-mention",
  "pov-unknown",
  "duplicate-name",
  "unordered",
  "dangling",
];

export function ContinuityPanel() {
  const version = useVaultVersion();
  const findings = useMemo(() => checkContinuity(store.vault), [version]);

  if (findings.length === 0) {
    return (
      <div className="continuity-panel">
        <p className="hint">
          Nothing out of order that these checks can see: no one on stage before
          their entrance, no near-duplicate codex names, no dangling links, every
          chapter placed, every POV known.
        </p>
        <p className="hint">
          These are the provable checks — they run from your files alone, no AI
          involved. Give a codex note <code>introduced: 3</code> in its
          frontmatter and Novella will flag any earlier chapter that mentions
          them.
        </p>
      </div>
    );
  }

  return (
    <div className="continuity-panel">
      <p className="hint">
        {findings.length} {findings.length === 1 ? "finding" : "findings"}, all
        provable from the files — no AI involved. Click one to open the note.
      </p>
      {KIND_ORDER.map((kind) => {
        const group = findings.filter((f) => f.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} className="continuity-group">
            <h3 className="settings-cat">{KIND_LABEL[kind]}</h3>
            <ul className="continuity-list">
              {group.map((f, i) => (
                <li key={`${f.noteId}-${i}`}>
                  <button className="continuity-item" onClick={() => store.open(f.noteId)}>
                    {f.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
