import { useState } from "react";
import { MUSIC_PRESETS, musicStore, parseMusicUrl, useMusic } from "../state/music";

/* Music controls, as a tab.

   The PLAYER itself stays in the floating dock — an iframe that moved
   into this tab would stop the sound every time you switched tabs, which
   is the one thing music must never do. This tab is the remote control:
   choose, change, or clear the playlist; the dock plays on regardless of
   what the inspector is showing. */

export function MusicTab({ onShowPlayer }: { onShowPlayer: () => void }) {
  const { url, embed } = useMusic();
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);

  const trySet = (candidate: string) => {
    if (musicStore.set(candidate)) {
      setDraft("");
      setBad(false);
      onShowPlayer();
    } else {
      setBad(true);
    }
  };

  return (
    <div className="music-tab">
      {embed ? (
        <>
          <p className="hint">
            This project has a playlist{embed.kind === "spotify" ? " on Spotify" : embed.kind === "youtube" ? " on YouTube" : ""} —
            it plays in the floating dock so switching tabs never stops it.
          </p>
          <div className="btn-row">
            <button className="btn-primary" onClick={onShowPlayer}>
              Show player
            </button>
            <button className="btn-ghost" onClick={() => musicStore.clear()}>
              Change playlist
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Paste a Spotify, YouTube, SoundCloud or Apple Music link — playlist, album,
            track or live stream. It's saved with this project and plays in a small dock
            that follows you between views.
          </p>
          <div className="music-input-row">
            <input
              className="search bare"
              value={draft}
              placeholder="https://open.spotify.com/playlist/…"
              onChange={(e) => {
                setDraft(e.target.value);
                setBad(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") trySet(draft);
              }}
              aria-label="Music link"
            />
            <button className="btn-primary" onClick={() => trySet(draft)} disabled={!draft.trim()}>
              Play
            </button>
          </div>
          {bad && (
            <p className="hint music-error">
              That link didn't look like a Spotify, YouTube, SoundCloud or Apple Music URL.
            </p>
          )}
          <div className="settings-section-label">Or start from a station</div>
          <div className="music-presets">
            {MUSIC_PRESETS.map((p) => (
              <button
                key={p.name}
                className="preset-chip"
                onClick={() => trySet(p.url)}
                title={parseMusicUrl(p.url)?.kind === "spotify" ? "Spotify" : "YouTube"}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
      {url && !embed && (
        <p className="hint music-error">The saved link no longer parses — paste a fresh one.</p>
      )}
    </div>
  );
}
