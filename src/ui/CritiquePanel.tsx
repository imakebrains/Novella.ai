import { useMemo } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { analyseProse } from "../analysis/prose";

/* The writing-quality report. Everything here is computed locally, so it
   updates as you type and costs nothing. Framed as observations rather
   than corrections — these are heuristics, and prose is not a lint rule. */

export function CritiquePanel() {
  useVaultVersion();
  const active = store.active();
  const body = active?.body ?? "";

  const report = useMemo(() => analyseProse(body), [body]);

  if (!active) return null;

  if (report.words < 20) {
    return (
      <div className="inspect-section">
        <p className="hint">
          Write a little more and the report fills in — it needs about twenty words
          to say anything worth reading.
        </p>
      </div>
    );
  }

  const mins = report.readingMinutes;
  const readTime = mins < 1 ? "under a minute" : `${Math.round(mins)} min read`;

  return (
    <>
      <section className="inspect-section">
        <div className="stat-grid">
          <Stat label="Words" value={report.words.toLocaleString()} />
          <Stat label="Sentences" value={String(report.sentences)} />
          <Stat label="Avg length" value={`${report.avgSentenceWords.toFixed(1)}w`} />
          <Stat label="Reading" value={readTime} />
        </div>
      </section>

      <Section title="Readability">
        <Meter
          value={report.readability.score}
          max={100}
          caption={`${report.readability.label} · grade ${report.readability.grade.toFixed(0)}`}
          good={report.readability.score >= 55}
        />
        <p className="hint">
          Fiction usually sits between 60 and 80. Lower isn't worse — it's denser.
        </p>
      </Section>

      <Section title="Rhythm">
        <Meter
          value={Math.min(report.sentenceVariety, 20)}
          max={20}
          caption={`Sentence variety ${report.sentenceVariety.toFixed(1)}`}
          good={report.sentenceVariety >= 5}
        />
        <p className="hint">
          {report.sentenceVariety < 5
            ? "Sentences are close to the same length — the rhythm may read flat."
            : "Good spread of sentence lengths."}
        </p>
        {report.longestSentence && report.longestSentence.words > 35 && (
          <div className="finding">
            <span className="finding-tag">{report.longestSentence.words} words</span>
            <span className="finding-text">“{truncate(report.longestSentence.text, 150)}”</span>
          </div>
        )}
      </Section>

      <Section title="Sticky sentences" count={report.stickySentences.length}>
        <Meter
          value={report.glueIndex}
          max={60}
          caption={`Glue index ${report.glueIndex.toFixed(0)}%`}
          good={report.glueIndex <= 45}
          invert
        />
        {report.stickySentences.length === 0 ? (
          <p className="hint">Nothing bogged down in filler words.</p>
        ) : (
          report.stickySentences.map((s, i) => (
            <div className="finding" key={i}>
              <span className="finding-tag">{s.words}w</span>
              <span className="finding-text">“{truncate(s.text, 130)}”</span>
            </div>
          ))
        )}
      </Section>

      <Section title="Echoes" count={report.echoes.length}>
        {report.echoes.length === 0 ? (
          <p className="hint">No words repeating close together.</p>
        ) : (
          <>
            <p className="hint">Repeated words sitting near each other.</p>
            <div className="chips">
              {report.echoes.map((e) => (
                <span key={e.word} className="chip echo" title={`${e.count}× · nearest ${e.nearest} words apart`}>
                  {e.word} <em>×{e.count}</em>
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Adverbs" count={report.adverbs.length}>
        {report.adverbs.length === 0 ? (
          <p className="hint">No -ly adverbs. Verbs are pulling their weight.</p>
        ) : (
          <div className="chips">
            {dedupe(report.adverbs.map((a) => a.text)).map((w) => (
              <span key={w} className="chip warn">
                {w}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Passive voice" count={report.passive.length}>
        {report.passive.length === 0 ? (
          <p className="hint">Nothing reading passive.</p>
        ) : (
          <>
            {report.passive.slice(0, 6).map((p, i) => (
              <div className="finding" key={i}>
                <span className="finding-text">…{p.text}…</span>
              </div>
            ))}
            <p className="hint">
              Detected by pattern, so expect some false positives — passive voice is
              sometimes the right call.
            </p>
          </>
        )}
      </Section>

      <Section title="Most used" count={report.overused.length}>
        {report.overused.length === 0 ? (
          <p className="hint">No word dominates.</p>
        ) : (
          <div className="chips">
            {report.overused.map((o) => (
              <span key={o.word} className="chip" title={`${o.per1000.toFixed(1)} per 1000 words`}>
                {o.word} <em>×{o.count}</em>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Dialogue">
        <Meter
          value={report.dialogueRatio * 100}
          max={100}
          caption={`${(report.dialogueRatio * 100).toFixed(0)}% dialogue`}
          good
        />
      </Section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Meter({
  value,
  max,
  caption,
  good,
  invert,
}: {
  value: number;
  max: number;
  caption: string;
  good: boolean;
  invert?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter-wrap">
      <div className="meter">
        <div
          className={`meter-fill ${good ? "good" : "warn"}`}
          style={{ width: `${invert ? 100 - pct : pct}%` }}
        />
      </div>
      <span className="meter-caption">{caption}</span>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="inspect-section">
      <h2 className="inspect-title">
        {title}
        {count !== undefined && count > 0 && <span className="count">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.toLowerCase()))];
}
