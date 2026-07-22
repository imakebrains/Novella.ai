import { useState } from "react";
import { MUSIC_PRESETS, musicStore, useMusic } from "../state/music";

/* The music dock.

   A small floating player that keeps playing while you move between
   Write and Board — which is the entire reason it lives at the app root
   rather than inside a view: unmounting an iframe stops the music, and
   the writer did not ask for silence just because they checked the
   corkboard.

   Collapsed, it's a pill. Expanded, it's the platform's own player in
   an iframe — their controls, their login, their stream. Novella never
   touches an audio API or a credential. */

export function MusicDock({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { url, embed } = useMusic();
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);

  // The iframe must stay mounted while music is set, even with the dock
  // "closed" — closed only means visually tucked away.
  if (!open && !embed) return null;

  const tryse = (candidate: string) => {
    if (musicStore.set(candidate)) {
      setDraft("");
      setBad(false);
    } else {
      setBad(true);
    }
  };

  return (
    <aside className={`music-dock ${open ? "open" : "tucked"}`} aria-label="Music player">
      {open && (
        <div className="music-head">
          <span className="music-title">♪ Writing music</span>
          <div className="music-head-actions">
            {embed && (
              <button
                className="banner-btn"
                onClick={() => musicStore.clear()}
                title="Remove this playlist"
              >
                Change
              </button>
            )}
            <button className="icon-btn" onClick={onClose} title="Tuck the player away (keeps playing)">
              ✕
            </button>
          </div>
        </div>
      )}

      {open && !embed && (
        <div className="music-setup">
          <p className="hint">
            Paste a Spotify, YouTube, SoundCloud or Apple Music link — a playlist, album,
            track or stream — and it plays here while you write. Saved with this project.
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
                if (e.key === "Enter") tryse(draft);
              }}
              aria-label="Music link"
            />
            <button className="btn-primary" onClick={() => tryse(draft)}>
              Play
            </button>
          </div>
          {bad && (
            <p className="hint music-error">
              That link didn't look like a Spotify, YouTube, SoundCloud or Apple Music URL.
            </p>
          )}
          <div className="music-presets">
            {MUSIC_PRESETS.map((p) => (
              <button key={p.name} className="preset-chip" onClick={() => tryse(p.url)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {embed && (
        <div className="music-frame" style={{ height: open ? embed.height : 0 }}>
          <iframe
            title="Music player"
            src={embed.embedUrl}
            height={embed.height}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ border: 0, width: "100%", borderRadius: "10px" }}
          />
        </div>
      )}
      {url && !embed && open && (
        <p className="hint music-error">Saved link no longer parses — paste a fresh one.</p>
      )}
    </aside>
  );
}
