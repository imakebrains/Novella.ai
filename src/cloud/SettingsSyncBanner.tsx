import { dismissSettingsNotice, useSettingsSync } from "./settingsHost";

/* What settings sync needs the writer to know, in the same banner as
   crash recovery and the motion notice.

   There is deliberately no Reload button: a reload with words still
   inside the autosave window would lean on crash recovery to get them
   back, and the writer is the one who knows when they've paused. */
export function SettingsSyncBanner() {
  const s = useSettingsSync();

  if (s.state === "too-large" && s.message && s.message !== s.dismissed) {
    return (
      <div className="banner error" role="status">
        <span className="banner-icon" aria-hidden>
          !
        </span>
        <span>
          Settings aren't syncing. {s.message} They are kept on this device.
        </span>
        <button className="banner-action" onClick={dismissSettingsNotice}>
          Dismiss
        </button>
      </div>
    );
  }

  if (s.reloadHint) {
    return (
      <div className="banner" role="status">
        <span className="banner-icon" aria-hidden>
          ↻
        </span>
        <span>Settings from your other device were applied — reload to see all of them.</span>
        <button className="banner-action" onClick={dismissSettingsNotice}>
          Dismiss
        </button>
      </div>
    );
  }

  return null;
}
