import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Original procedural score: low pulse, quiet data ticks, section accents.
 * No samples, game audio, voices or external assets. Peak limited below -6 dB.
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
  const cuts = [0, 1.4, 15, 19, 23.33, 24.67, 26, 27.33, 31, 42, 49.67, 64.33, 71, 83, 85.5, 88, 90.5, 93, 104.33, 117, 125.27, 133.5, 141.73, 150, 155, 160, 165, 172];
  let cut = 0;
  const tau = Math.PI * 2;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    while (cut + 1 < cuts.length && t >= cuts[cut + 1]) cut++;
    const beat = t % 0.625; // 96 BPM; the visual cuts need not quantize to it.
    const tick = t % 0.3125;
    const sinceCut = t - cuts[cut];
    const fade = Math.min(1, t / 1.5, Math.max(0, (180 - t) / 2));
    const body = 0.035 * Math.sin(tau * 55 * t) + 0.018 * Math.sin(tau * 82.4069 * t);
    const pulse = 0.13 * Math.exp(-beat * 16) * Math.sin(tau * (55 * beat + 1.6 * (1 - Math.exp(-beat * 25))));
    const data = 0.018 * Math.exp(-tick * 110) * Math.sin(tau * 1320 * tick);
    const accent = 0.08 * Math.exp(-sinceCut * 12) * (Math.sin(tau * 110 * sinceCut) + 0.25 * Math.sin(tau * 1760 * sinceCut));
    const value = Math.tanh((body + pulse + data + accent) * fade);
    pcm.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "soundtrack.wav"), pcm);
}
