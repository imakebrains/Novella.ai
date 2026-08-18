import alpine from "../assets/backdrop-alpine.webp";
import goldenhour from "../assets/backdrop-goldenhour.webp";
import inkmoon from "../assets/backdrop-inkmoon.webp";
import maple from "../assets/backdrop-maple.jpg";
import suns from "../assets/backdrop-suns.jpg";

/* Bundled backdrops — a starting point, not a gallery.

   Presets are stored as "preset:<id>" markers rather than data URLs so
   a chosen built-in costs localStorage a dozen bytes, not half a
   megabyte, and upgrading the artwork in a release upgrades it for
   everyone who picked it. Custom uploads still store the image itself
   and always win — the preset row is a shortcut, not a cage. */

export interface BackdropPreset {
  id: string;
  name: string;
  url: string;
}

export const BACKDROP_PRESETS: BackdropPreset[] = [
  { id: "alpine", name: "Alpine trail", url: alpine },
  { id: "goldenhour", name: "Golden hour", url: goldenhour },
  { id: "suns", name: "Twin suns", url: suns },
  { id: "inkmoon", name: "Ink moon", url: inkmoon },
  { id: "maple", name: "Red maple", url: maple },
];

const PREFIX = "preset:";

/** What the Backdrop layer should actually render for a stored value. */
export function resolveBackdrop(bgImage: string | undefined): string | undefined {
  if (!bgImage) return undefined;
  if (bgImage.startsWith(PREFIX)) {
    const id = bgImage.slice(PREFIX.length);
    return BACKDROP_PRESETS.find((p) => p.id === id)?.url;
  }
  return bgImage;
}

export function presetMarker(id: string): string {
  return PREFIX + id;
}
