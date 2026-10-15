// node tts.mjs : renders every line of walk_vo.json to tts/<id>.wav (48 kHz mono, edges trimmed) with the same model and speaker as the rest of the film:
// Cloudflare Workers AI @cf/deepgram/aura-2-en, speaker "orion". Credentials: CLOUDFLARE_API_TOKEN from the env, else 1Password "CF-TAT" (Earl-and-Alyce) via `op`.
// The token is held in memory only. Cached by a hash of (model, speaker, spoken text). Writes tts/durations.json.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FF = "/usr/local/bin/ffmpeg", FP = "/usr/local/bin/ffprobe";
const MODEL = "@cf/deepgram/aura-2-en", SPEAKER = "orion";
const lines = JSON.parse(fs.readFileSync(path.join(HERE, "walk_vo.json"), "utf8"));

const op = (field) => execSync(`op item get "CF-TAT" --vault "Earl-and-Alyce" --fields ${field} --reveal`, { encoding: "utf8", timeout: 30000 }).trim();
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || op("api_token");
const ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || op("account_id");

fs.mkdirSync(path.join(HERE, "tts/raw"), { recursive: true });
const durFile = path.join(HERE, "tts/durations.json");
const durs = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, "utf8")) : {};
const hashOf = (t) => crypto.createHash("sha1").update(MODEL + "|" + SPEAKER + "|" + t).digest("hex").slice(0, 12);
let calls = 0;
for (const l of lines) {
  const say = l.say || l.text;
  const h = hashOf(say), raw = path.join(HERE, `tts/raw/${l.id}.${h}.wav`), out = path.join(HERE, `tts/${l.id}.wav`);
  if (fs.existsSync(raw) && fs.existsSync(out) && durs[l.id]?.hash === h) continue;
  let buf = null;
  for (let attempt = 0; attempt < 4 && !buf; attempt++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/run/${MODEL}`, {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: say, speaker: SPEAKER, encoding: "linear16", container: "wav", sample_rate: 24000 }),
    });
    if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    else { console.log(l.id, "HTTP", r.status, "retry"); await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); }
  }
  if (!buf) throw new Error("TTS failed for " + l.id);
  calls++; fs.writeFileSync(raw, buf);
  const p = spawnSync(FF, ["-y", "-loglevel", "error", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse", "-ar", "48000", "-ac", "1", out]);
  if (p.status !== 0) throw new Error("ffmpeg trim failed " + l.id);
  const d = parseFloat(spawnSync(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout);
  durs[l.id] = { sec: +d.toFixed(3), hash: h, words: l.text.split(/\s+/).length };
  console.log(l.id, d.toFixed(2) + "s", (durs[l.id].words / d).toFixed(2) + " w/s");
}
fs.writeFileSync(durFile, JSON.stringify(durs, null, 1));
const tot = lines.reduce((s, l) => s + (durs[l.id]?.sec ?? 0), 0);
console.log(`TTS calls: ${calls}, ${lines.length} lines, ${tot.toFixed(1)} s of speech, model ${MODEL}, speaker ${SPEAKER}`);
