// node mixvo.mjs --seg open|hood|close
// Lays the TTS lines (build/tts/<id>.wav) at their start times, ducks the music bed 12 dB (cues 6 dB) under the voice with a smooth
// envelope, two-pass loudnorm to -16 LUFS / -1.5 dBTP, then muxes with build/<seg>_noaudio.mp4 -> out/seg_<seg>.mp4.
import fs from "node:fs"; import { spawnSync } from "node:child_process";
const SEG = process.argv[process.argv.indexOf("--seg") + 1] || "open";
const DUR = { open: 96, hood: 43, close: 15.6 }[SEG], SR = 48000, N = Math.round(DUR * SR);
const FF = "/usr/local/bin/ffmpeg";
const VO = JSON.parse(fs.readFileSync("vo.json", "utf8")).lines.filter((l) => l.seg === SEG);
const D = JSON.parse(fs.readFileSync("build/tts/durations.json", "utf8"));
const pcm = (file) => { const r = spawnSync(FF, ["-v", "error", "-i", file, "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 }); if (r.status !== 0) throw new Error("decode " + file); const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)); };
const bed = pcm(`build/audio_${SEG}_bed_raw.wav`), cues = pcm(`build/audio_${SEG}_cues_raw.wav`);
const voice = new Float32Array(N * 2), mask = new Float32Array(N);
for (const l of VO) {
  const w = pcm(`build/tts/${l.id}.wav`), s0 = Math.round(l.t * SR);
  for (let i = 0; i < w.length / 2 && s0 + i < N; i++) { voice[(s0 + i) * 2] += w[i * 2]; voice[(s0 + i) * 2 + 1] += w[i * 2 + 1]; }
  const a = Math.max(0, Math.round((l.t - 0.1) * SR)), b = Math.min(N, Math.round((l.t + D[l.id].sec + 0.25) * SR)); mask.fill(1, a, b);
}
// smooth the ducking envelope: attack 0.12 s, release 0.6 s
const env = new Float32Array(N); let e = 0; const ka = 1 - Math.exp(-1 / (0.12 * SR)), kr = 1 - Math.exp(-1 / (0.6 * SR));
for (let i = 0; i < N; i++) { e += (mask[i] - e) * (mask[i] > e ? ka : kr); env[i] = e; }
const rms = (x, m) => { let s = 0, n = 0; for (let i = 0; i < N; i++) if (!m || m[i] > 0.5) { s += x[i * 2] ** 2; n++; } return Math.sqrt(s / Math.max(1, n)); };
const vR = rms(voice, mask), bR = rms(bed.subarray(0, N * 2), mask);
const db = (x) => 20 * Math.log10(x);
const gBedDucked = (vR * Math.pow(10, -12 / 20)) / bR;          // bed sits 12 dB under the voice while the voice speaks
const gBed = gBedDucked * Math.pow(10, 6 / 20);                  // and rises 6 dB in the gaps
const out = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const duck = 1 - env[i] * (1 - Math.pow(10, -6 / 20));         // 0 -> unity, 1 -> -6 dB (so bed total is -12 dB under voice vs. the +6 baseline)
  const bedG = gBed * (1 - env[i] * (1 - Math.pow(10, -6 / 20)));
  const cueG = gBed * 1.0 * (1 - env[i] * 0.5);
  for (let c = 0; c < 2; c++) out[i * 2 + c] = voice[i * 2 + c] + bed[i * 2 + c] * bedG + cues[i * 2 + c] * cueG;
}
// 16-bit wav
const buf = Buffer.alloc(44 + N * 4); buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
let pk = 0; for (let i = 0; i < N * 2; i++) pk = Math.max(pk, Math.abs(out[i]));
const norm = pk > 0.95 ? 0.95 / pk : 1;
for (let i = 0; i < N * 2; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * norm)) * 32767), 44 + i * 2);
fs.writeFileSync(`build/${SEG}_prenorm.wav`, buf);
const I = -16, TP = -1.5, LRA = 11;
const ff = (a) => spawnSync(FF, a, { encoding: "utf8", maxBuffer: 1 << 28 });
const p1 = ff(["-hide_banner", "-nostats", "-i", `build/${SEG}_prenorm.wav`, "-af", `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, "-f", "null", "-"]);
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf("{"), p1.stderr.lastIndexOf("}") + 1));
fs.mkdirSync("verify", { recursive: true }); fs.writeFileSync(`verify/loudnorm_${SEG}_pass1.json`, JSON.stringify(m, null, 2));
const af = `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
const p2 = ff(["-y", "-hide_banner", "-nostats", "-i", `build/${SEG}_prenorm.wav`, "-af", af, "-ar", "48000", `build/${SEG}_final.wav`]);
fs.writeFileSync(`verify/loudnorm_${SEG}_pass2.txt`, p2.stderr);
console.log(`${SEG}: voice rms ${db(vR).toFixed(1)} dBFS, bed ducked ${db(gBedDucked * bR).toFixed(1)} dBFS (12 dB under), pre-norm I ${m.input_i} LUFS`);
if (fs.existsSync(`build/${SEG}_noaudio.mp4`)) {
  fs.mkdirSync("out", { recursive: true });
  const mx = ff(["-y", "-loglevel", "error", "-i", `build/${SEG}_noaudio.mp4`, "-i", `build/${SEG}_final.wav`, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", `out/seg_${SEG}.mp4`]);
  console.log(mx.status === 0 ? `wrote out/seg_${SEG}.mp4` : mx.stderr);
}
