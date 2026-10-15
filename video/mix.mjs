// node mix.mjs : two-pass loudnorm of the procedural mix to -16 LUFS / -1.5 dBTP; stems get the same gain.
import { spawnSync } from "node:child_process"; import fs from "node:fs";
const ff = (args) => spawnSync("/usr/local/bin/ffmpeg", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const I = -16, TP = -1.5, LRA = 11;
const p1 = ff(["-hide_banner", "-nostats", "-i", "build/audio_mix_raw.wav", "-af", `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, "-f", "null", "-"]);
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf("{"), p1.stderr.lastIndexOf("}") + 1));
fs.writeFileSync("verify/loudnorm_pass1.json", JSON.stringify(m, null, 2));
const af = `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
fs.mkdirSync("out", { recursive: true });
const p2 = ff(["-y", "-hide_banner", "-nostats", "-i", "build/audio_mix_raw.wav", "-af", af, "-ar", "48000", "build/audio_master.wav"]);
fs.writeFileSync("verify/loudnorm_pass2.txt", p2.stderr);
const gain = (I - parseFloat(m.input_i)).toFixed(2);   // same gain for the stems so they stay in proportion to the mix
for (const n of ["bed", "cues"]) ff(["-y", "-loglevel", "error", "-i", `build/audio_${n}_raw.wav`, "-af", `volume=${gain}dB,alimiter=limit=0.84:level=false`, `out/audio_${n}_stem.wav`]);
console.log("pass1 input_i", m.input_i, "tp", m.input_tp, "gain", gain, "dB");
