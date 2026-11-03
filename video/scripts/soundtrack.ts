import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Original procedural score: a warm, slow pad (D–Bm–G–A, 8 s per chord) with
 * soft bell notes on section cuts, and from 0:15 a light 90 BPM groove (soft kick,
 * shaker, plucked arpeggio). no samples or external assets.
 * Peak limited below -6 dB.
 */
export function writeSoundtrack(publicDir: string): void {
  const rate = 24000;
  const seconds = 180;
  const samples = rate * seconds;
  const pcm = Buffer.alloc(44 + samples * 2);
  pcm.write("RIFF", 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(rate, 24); pcm.writeUInt32LE(rate * 2, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36); pcm.writeUInt32LE(samples * 2, 40);
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  // D maj9, B min7, G maj7, A sus — open voicings in MIDI notes.
  const chords = [[50, 57, 62, 66, 69, 76], [47, 54, 62, 66, 69, 74], [43, 50, 59, 62, 66, 74], [45, 52, 59, 62, 64, 73]];
  const bells = [0, 15, 31, 83, 117, 150, 172];
  const bellNote = [hz(81), hz(78), hz(76), hz(81), hz(78), hz(74), hz(74)];
  const tau = Math.PI * 2;
  const len = 8;
  let lp = 0;
  let noise = 1;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const idx = Math.floor(t / len);
    const local = t - idx * len;
    const xf = Math.min(1, local / 2.5); // 2.5 s crossfade into each chord
    const voice = (c: number[]) =>
      c.reduce((acc, m, k) => {
        const f = hz(m);
        return acc + (Math.sin(tau * f * t) + 0.5 * Math.sin(tau * f * 1.003 * t + k)) / (1 + k * 0.35);
      }, 0) / c.length;
    const cur = voice(chords[idx % 4]);
    const prev = voice(chords[(idx + 3) % 4]);
    const swell = 0.75 + 0.25 * Math.sin(tau * t / 16);
    let pad = 0.55 * swell * (cur * xf + prev * (1 - xf));
    lp += 0.08 * (pad - lp); // gentle low-pass for warmth
    pad = lp;
    let bell = 0;
    bells.forEach((b, k) => {
      const d = t - b;
      if (d >= 0 && d < 5) bell += 0.2 * Math.exp(-d * 1.4) * (Math.sin(tau * bellNote[k] * d) + 0.3 * Math.sin(tau * bellNote[k] * 2.01 * d));
    });
    // Gentle groove from 0:15 on: 90 BPM soft kick, off-beat shaker, plucked arpeggio.
    const groove = Math.min(1, Math.max(0, (t - 15) / 4)) * Math.min(1, Math.max(0, (172 - t) / 4));
    const bt = 60 / 90;
    const inBeat = t % bt;
    const kick = 0.42 * Math.exp(-inBeat * 9) * Math.sin(tau * (48 * inBeat + 6 * (1 - Math.exp(-inBeat * 30))));
    const half = (t + bt / 2) % bt;
    noise = (noise * 1103515245 + 12345) % 2147483648;
    const shaker = 0.035 * Math.exp(-half * 40) * ((noise / 1073741824) - 1);
    const eighth = bt / 2;
    const step = Math.floor(t / eighth);
    const chord = chords[idx % 4];
    const note = hz(chord[[2, 3, 4, 5, 4, 3, 2, 4][step % 8]] + 12);
    const inStep = t - step * eighth;
    const pluck = 0.09 * Math.exp(-inStep * 7) * (Math.sin(tau * note * inStep) + 0.35 * Math.sin(tau * note * 2 * inStep));
    const fade = Math.min(1, t / 3, Math.max(0, (180 - t) / 3));
    const value = Math.tanh((pad + bell + groove * (kick + shaker + pluck)) * fade * 1.4) * 0.7;
    pcm.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "soundtrack.wav"), pcm);
}
