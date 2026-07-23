import { useRef, useState } from "react";
import { MUSIC_PRESETS, musicStore, useMusic } from "../state/music";

/* The music dock.

   A floating player that keeps playing while you move between Write and
   Board — which is the entire reason it lives at the app root rather
   than inside a view: unmounting an iframe stops the music, and the
   writer did not ask for silence just because they checked the corkboard.

   Grab the header to move it anywhere; ▁ shrinks it to a mini bar with
   the music still running; ✕ tucks it away entirely (also still
   playing — the Music tab brings it back). The player itself is the
   platform's own iframe — their controls, their login, their stream.
   Novella never touches an audio API or a credential. */

export function MusicDock({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { url, embed } = useMusic();
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);
  const [mini, setMini] = useState(false);
  // Where the writer dragged it to. Null = the default corner.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dock = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

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

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    const rect = dock.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const w = dock.current?.offsetWidth ?? 320;
    const h = dock.current?.offsetHeight ?? 200;
    setPos({
      x: Math.min(Math.max(8, e.clientX - drag.current.dx), window.innerWidth - w - 8),
      y: Math.min(Math.max(8, e.clientY - drag.current.dy), window.innerHeight - h - 8),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const style = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;

  return (
    <aside
      ref={dock}
      className={`music-dock ${open ? "open" : "tucked"} ${mini ? "mini" : ""}`}
      style={style}
      aria-label="Music player"
    >
      {open && (
        <div
          className="music-head"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Drag to move the player anywhere"
        >
          <span className="music-title">
            <span className="music-note-badge">♪</span> Writing music
          </span>
          <div className="music-head-actions">
            {embed && !mini && (
              <button
                className="banner-btn"
                onClick={() => musicStore.clear()}
                title="Remove this playlist and pick another"
              >
                Change
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => setMini((v) => !v)}
              title={mini ? "Expand the player" : "Shrink to a mini bar (keeps playing)"}
              aria-pressed={mini}
            >
              {mini ? "▔" : "▁"}
            </button>
            <button className="icon-btn" onClick={onClose} title="Tuck the player away — the music keeps playing; reopen from the Music tab">
              ✕
            </button>
          </div>
        </div>
      )}

      {open && !embed && !mini && (
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
        <div className="music-frame" style={{ height: open && !mini ? embed.height : 0 }}>
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
      {url && !embed && open && !mini && (
        <p className="hint music-error">Saved link no longer parses — paste a fresh one.</p>
      )}
    </aside>
  );
}
