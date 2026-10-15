// node tts.mjs [--force] [--seg open|hood|close|walk] : renders every line in vo.json to build/tts/<id>.wav (48 kHz mono, edges trimmed)
// through Cloudflare Workers AI text-to-speech (@cf/deepgram/aura-2-en, speaker "orion"; chosen in README.md).
// Credentials: CLOUDFLARE_API_TOKEN from the environment, else the 1Password item "CF-TAT" (Earl-and-Alyce) via `op`.
// The token is read into memory only: never printed, logged or written to disk.
// Usage for other segments (e.g. the product walkthrough):
//   node tts.mjs --text "Any sentence." --out build/tts/mine.wav      one arbitrary line -> 48 kHz mono WAV (trimmed), prints its duration
//   node tts.mjs --id walk.07                                       re-render a single vo.json line
//   node tts.mjs --seg walk                                         every line of one segment
//   node tts.mjs                                                    every line (cached by text hash)
// Optional: --speaker <name> (default from vo.json), --model <id>.
// Writes build/tts/durations.json ({id: seconds}); lines are cached by a hash of (model, speaker, text), so reruns are free.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const force = process.argv.includes("--force"), only = arg("--seg", null), onlyId = arg("--id", null), oneText = arg("--text", null);
const FF = "/usr/local/bin/ffmpeg", FP = "/usr/local/bin/ffprobe";
const VO = JSON.parse(fs.readFileSync("vo.json", "utf8"));
const model = arg("--model", VO.voice.model), speaker = arg("--speaker", VO.voice.speaker);
globalThis.window = globalThis; await import("./facts.js");
const fill = (s) => s.replace(/\{(\w+)\.(\w+)\}/g, (m, a, b) => { const v = globalThis.FACTS[a]?.[b]; if (v === null || v === undefined) throw new Error("fact " + a + "." + b + " is null; reword the line"); return String(v); });

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  return execSync(`op item get "CF-TAT" --vault "Earl-and-Alyce" --fields api_token --reveal`, { encoding: "utf8", timeout: 30000 }).trim();
}
const TOKEN = token();
let ACCT = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!ACCT) ACCT = (await (await fetch("https://api.cloudflare.com/client/v4/accounts", { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result[0].id;

fs.mkdirSync("build/tts/raw", { recursive: true });
const durFile = "build/tts/durations.json";
const durs = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, "utf8")) : {};
const hashOf = (txt) => crypto.createHash("sha1").update(model + "|" + speaker + "|" + txt).digest("hex").slice(0, 12);
let calls = 0;
async function synth(say, raw, out) {
  let buf = null;
  for (let attempt = 0; attempt < 4 && !buf; attempt++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/run/${model}`, { method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: say, speaker, encoding: "linear16", container: "wav", sample_rate: 24000 }) });
    if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    else { console.log("HTTP", r.status, "retry"); await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); }
  }
  if (!buf) throw new Error("TTS failed");
  fs.writeFileSync(raw, buf);
  const p = spawnSync(FF, ["-y", "-loglevel", "error", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse", "-ar", "48000", "-ac", "1", out]);
  if (p.status !== 0) throw new Error("ffmpeg trim failed");
  return parseFloat(spawnSync(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout);
}
if (oneText) {
  const out = arg("--out", "build/tts/adhoc.wav"); fs.mkdirSync(path.dirname(out), { recursive: true });
  const d = await synth(oneText, out.replace(/\.wav$/, ".raw.wav"), out);
  console.log(out, d.toFixed(2) + "s"); process.exit(0);
}
for (const l of VO.lines) {
  if (only && l.seg !== only) continue;
  if (onlyId && l.id !== onlyId) continue;
  const say = fill(l.say || l.text);
  const h = hashOf(say), raw = `build/tts/raw/${l.id}.${h}.wav`, out = `build/tts/${l.id}.wav`;
  if (!force && fs.existsSync(raw) && fs.existsSync(out) && durs[l.id]?.hash === h) continue;
  let buf = null;
  for (let attempt = 0; attempt < 4 && !buf; attempt++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/run/${model}`, { method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: say, speaker, encoding: "linear16", container: "wav", sample_rate: 24000 }) });
    if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    else { console.log(l.id, "HTTP", r.status, "retry"); await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); }
  }
  if (!buf) throw new Error("TTS failed for " + l.id);
  calls++; fs.writeFileSync(raw, buf);
  // trim leading/trailing silence so the line starts exactly at its cue time; 48 kHz mono; no other processing
  const p = spawnSync(FF, ["-y", "-loglevel", "error", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse", "-ar", "48000", "-ac", "1", out]);
  if (p.status !== 0) throw new Error("ffmpeg trim failed " + l.id);
  const d = parseFloat(spawnSync(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout);
  durs[l.id] = { sec: +d.toFixed(3), hash: h, words: l.text.split(/\s+/).length };
  console.log(l.id, d.toFixed(2) + "s", (durs[l.id].words / d).toFixed(2) + " w/s");
}
fs.writeFileSync(durFile, JSON.stringify(durs, null, 1));
console.log("TTS calls:", calls, "model:", model, "speaker:", speaker);
