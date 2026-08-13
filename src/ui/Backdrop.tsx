import { useSyncExternalStore } from "react";
import {
  loadPersonalization,
  personalizationVersion,
  subscribePersonalization,
} from "./personalize";

/* The backdrop — any image the writer loves, softened to atmosphere.

   The image is downscaled at upload, blurred here, and every surface
   above it goes frosted (see .has-backdrop in app.css) so the picture
   reads as light behind glass, never as noise behind text. */

export function Backdrop() {
  useSyncExternalStore(subscribePersonalization, personalizationVersion, personalizationVersion);
  const img = loadPersonalization().bgImage;
  if (!img) return null;
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop-img" style={{ backgroundImage: `url(${img})` }} />
    </div>
  );
}
