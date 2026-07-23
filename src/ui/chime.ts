/* A soft two-note finish chime, synthesized rather than shipped as an
   asset — there's no audio pipeline in the app yet, and a sine pair needs
   no file, no Tauri bundle change, and no license. */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes: Array<[freq: number, delay: number]> = [
      [880, 0], // A5
      [1318.5, 0.16], // E6
    ];
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    }
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {
    // Sound is a nicety; a finished sprint still logs without it.
  }
}
