// ─────────────────────────────────────────────────────────────
// Audio sound synthesizer for Upwork-style camera shutter click.
// Uses Web Audio API — zero external mp3 files required.
// ─────────────────────────────────────────────────────────────

export function playCameraShutterSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // 1. Noise burst for mechanical shutter snap
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(3.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    // 2. Mechanical click tone (mirror opening)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);

    // 3. Second shutter closing click (70ms later)
    setTimeout(() => {
      try {
        const t2 = ctx.currentTime;
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(800, t2);
        osc2.frequency.exponentialRampToValueAtTime(140, t2 + 0.06);

        gain2.gain.setValueAtTime(0.3, t2);
        gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.06);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(t2);
      } catch {
        // Ignored
      }
    }, 70);
  } catch {
    // Web Audio blocked
  }
}
