// node assemble.mjs [--only walk.05,walk.06] : cuts the recorded beats (out/live, out/static) to fit the voiceover and writes out/walkthrough.mp4 + .srt
// Needs: node tts.mjs (tts/<id>.wav), node capture.mjs live|static (out/*/frames.json), plan.mjs (which footage each line sits on).
// Per beat: voice starts 0.4 s in, the beat ends 0.7 s after the voice. Footage longer than that is time-lapsed (a "N x speed" badge shows when it is
// sped up more than 1.3x); shorter footage holds its last frame. Captions are burned in (PNG overlays rendered by Chrome: this ffmpeg has no drawtext).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import puppeteer from "../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { makePlan } from "./plan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FF = "/usr/local/bin/ffmpeg", FP = "/usr/local/bin/ffprobe";
const P = (...a) => path.join(HERE, ...a);
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const only = arg("--only")?.split(",");
const LEAD = 0.4, TAIL = 0.7, FPS = 30;
const lines = JSON.parse(fs.readFileSync(P("walk_vo.json"), "utf8"));
const durs = JSON.parse(fs.readFileSync(P("tts/durations.json"), "utf8"));
const run = (cmd, args, opt = {}) => { const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opt }); if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || "").slice(-1500)}`); return r; };

// ---------- footage sources
const SRC = {};
for (const s of ["live", "review", "static"]) {
  const f = P(`out/${s}/frames.json`);
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  d.dir = P(`out/${s}/frames`);
  d.events = fs.existsSync(P(`out/${s}/events.json`)) ? JSON.parse(fs.readFileSync(P(`out/${s}/events.json`), "utf8")) : [];
  SRC[s] = d;
}
const T = (src, name, phase, off = 0) => {
  const m = SRC[src].marks.find((x) => x.name === name && x.phase === phase);
  if (!m) throw new Error(`no mark ${src}:${name}:${phase}`);
  return m.t + off;
};
const EV = (src, pred, off = 0) => { const e = SRC[src].events.find(pred); if (!e) throw new Error(`no matching event in ${src}`); return e.t / 1000 + off; };
const plan = makePlan({ T, EV, SRC });

// ---------- cutting
function cutToMp4(src, t0, t1, speed, outFile, hold = 0) {
  const fr = SRC[src].frames;
  // frame in effect at t0 = last frame at or before t0
  let i0 = 0;
  for (let i = 0; i < fr.length; i++) { if (fr[i].t <= t0) i0 = i; else break; }
  const list = [];
  const push = (f, a, b) => { const d = (b - a) / speed; if (d > 0.0005) list.push([f, d]); };
  for (let i = i0; i < fr.length && fr[i].t < t1; i++) {
    const a = Math.max(fr[i].t, t0), b = Math.min(fr[i + 1] ? fr[i + 1].t : t1, t1);
    push(fr[i].f, a, b);
  }
  if (!list.length) list.push([fr[i0].f, (t1 - t0) / speed]);
  if (hold > 0) list.push([list[list.length - 1][0], hold]);
  const txt = list.map(([f, d]) => `file '${path.join(SRC[src].dir, f)}'\nduration ${d.toFixed(5)}`).join("\n") + `\nfile '${path.join(SRC[src].dir, list[list.length - 1][0])}'\n`;
  const lf = outFile.replace(/\.mp4$/, ".txt");
  fs.writeFileSync(lf, txt);
  run(FF, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lf, "-vf", `fps=${FPS},scale=1920:1080:flags=bicubic,format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-r", String(FPS), outFile]);
}

// ---------- captions: split each VO line into short chunks, timed by character share of the line's voice
function chunks(text) {
  const out = [];
  for (const s of text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [text]) {
    let t = s.trim();
    while (t.length > 92) {
      let cut = t.lastIndexOf(", ", 80); if (cut < 30) cut = t.lastIndexOf(" and ", 80); if (cut < 30) cut = t.lastIndexOf(" ", 80);
      out.push(t.slice(0, cut + 1).trim()); t = t.slice(cut + 1).trim();
    }
    if (t) out.push(t);
  }
  return out;
}
const srtT = (s) => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), x = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };

fs.mkdirSync(P("work"), { recursive: true });
fs.mkdirSync(P("out"), { recursive: true });

// ---------- overlay PNGs
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const pg = await browser.newPage();
await pg.setViewport({ width: 1920, height: 200, deviceScaleFactor: 1 });
async function pill(html, file, w = 1700) {
  await pg.setContent(`<body style="margin:0;background:transparent;width:${w}px;display:flex;justify-content:center"><div style="font:600 31px/1.3 -apple-system,'SF Pro Text',Helvetica,Arial,sans-serif;color:#fff;background:rgba(10,14,22,.82);padding:11px 26px 13px;border-radius:12px;text-align:center;max-width:${w - 80}px;display:inline-block;box-shadow:0 2px 14px rgba(0,0,0,.35)">${html}</div></body>`);
  const el = await pg.$("div"); await el.screenshot({ path: file, omitBackground: true });
}
async function badge(txt, file) {
  await pg.setContent(`<body style="margin:0;background:transparent"><div style="display:inline-block;font:700 30px/1 ui-monospace,'SF Mono',Menlo,monospace;color:#0b1220;background:#F6821F;padding:11px 18px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.4)">${txt}</div></body>`);
  const el = await pg.$("div"); await el.screenshot({ path: file, omitBackground: true });
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---------- build each beat
const beats = []; // {id, start, len, vo, dur}
let clock = 0;
const srt = []; let srtN = 1;
for (const l of lines) {
  const d = durs[l.id].sec;
  const len = LEAD + d + TAIL;
  beats.push({ id: l.id, start: clock, len, dur: d, text: l.text });
  clock += len;
}
const total = clock;
console.log(`beats ${beats.length}, total ${total.toFixed(1)} s`);

for (const b of beats) {
  if (only && !only.includes(b.id)) continue;
  const pl = plan[b.id];
  if (!pl) throw new Error("no plan for " + b.id);
  // cuts: [{src, t0, t1, speed?}]; fixed-speed cuts first, the rest share what is left
  const fixed = pl.cuts.filter((c) => c.speed);
  const autos = pl.cuts.filter((c) => !c.speed);
  const fixedLen = fixed.reduce((s, c) => s + (c.t1 - c.t0) / c.speed, 0);
  const autoNat = autos.reduce((s, c) => s + (c.t1 - c.t0), 0);
  const room = Math.max(0.5, b.len - fixedLen);
  let autoSpeed = 1, hold = 0;
  if (autos.length) { if (autoNat > room * 1.04) autoSpeed = autoNat / room; else hold = room - autoNat; }
  const parts = []; let k = 0, maxSpeed = 1;
  pl.cuts.forEach((c, ci) => {
    const sp = c.speed || autoSpeed;
    maxSpeed = Math.max(maxSpeed, sp);
    const f = P(`work/${b.id}_${k++}.mp4`);
    // the hold goes on the last cut so the beat is exactly b.len long
    cutToMp4(c.src, c.t0, c.t1, sp, f, ci === pl.cuts.length - 1 ? Math.max(0, hold) : 0);
    parts.push(f);
  });
  b.speed = maxSpeed; b.parts = parts;
  const cat = P(`work/${b.id}_cat.txt`);
  fs.writeFileSync(cat, parts.map((p) => `file '${p}'`).join("\n"));
  b.raw = P(`work/${b.id}_raw.mp4`);
  run(FF, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", cat, "-t", b.len.toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-r", String(FPS), "-pix_fmt", "yuv420p", b.raw]);
  console.log(b.id, `len ${b.len.toFixed(1)} speed ${maxSpeed.toFixed(1)}x`, pl.cuts.map((c) => `${c.src}:${(c.t1 - c.t0).toFixed(0)}s${c.speed ? "@" + c.speed : ""}`).join(" + "));
}
if (only) { await browser.close(); process.exit(0); }

// captions + badges per beat, burned in during the per-beat encode
for (const b of beats) {
  const cs = chunks(b.text), chars = cs.reduce((s, c) => s + c.length, 0);
  let t = b.start + LEAD; b.caps = [];
  cs.forEach((c, i) => {
    const dd = (b.dur * c.length) / chars;
    const png = P(`work/${b.id}_c${i}.png`);
    b.caps.push({ png, a: t - b.start, b: t + dd - b.start, text: c });
    srt.push(`${srtN++}\n${srtT(t)} --> ${srtT(t + dd)}\n${c}\n`);
    t += dd;
  });
  for (const c of b.caps) await pill(esc(c.text), c.png);
  b.badge = null;
  if (b.speed > 1.3) { b.badge = P(`work/${b.id}_badge.png`); await badge(`${b.speed >= 10 ? Math.round(b.speed) : b.speed.toFixed(1).replace(/\.0$/, "")}&times; speed`, b.badge); }
}
await browser.close();

const finals = [];
for (const b of beats) {
  const inputs = ["-i", b.raw, ...b.caps.flatMap((c) => ["-loop", "1", "-i", c.png]), ...(b.badge ? ["-loop", "1", "-i", b.badge] : [])];
  let g = "[0:v]", n = 1, chain = "";
  b.caps.forEach((c, i) => { chain += `${g}[${n}:v]overlay=x=(W-w)/2:y=H-h-44:enable='between(t,${c.a.toFixed(3)},${c.b.toFixed(3)})':format=auto[v${n}];`; g = `[v${n}]`; n++; });
  if (b.badge) { chain += `${g}[${n}:v]overlay=x=40:y=H-h-150:format=auto[v${n}];`; g = `[v${n}]`; n++; }
  chain = chain.replace(/;$/, "");
  const out = P(`work/${b.id}_final.mp4`);
  run(FF, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", chain || "null", "-map", g, "-t", b.len.toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-r", String(FPS), "-pix_fmt", "yuv420p", out]);
  finals.push(out);
}
fs.writeFileSync(P("work/final_cat.txt"), finals.map((p) => `file '${p}'`).join("\n"));
run(FF, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", P("work/final_cat.txt"), "-c", "copy", P("work/video_only.mp4")]);
fs.writeFileSync(P("out/walkthrough.srt"), srt.join("\n"));

// ---------- audio: voice at each beat's LEAD, music bed 14 dB under it, loudnorm to -16 LUFS
const vin = beats.flatMap((b) => ["-i", P(`tts/${b.id}.wav`)]);
const vf = beats.map((b, i) => `[${i}:a]adelay=${Math.round((b.start + LEAD) * 1000)}:all=1[a${i}]`).join(";");
const voiceWav = P("work/voice.wav");
run(FF, ["-y", "-loglevel", "error", ...vin, "-filter_complex", `${vf};${beats.map((_, i) => `[a${i}]`).join("")}amix=inputs=${beats.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)}[v]`, "-map", "[v]", "-ar", "48000", "-ac", "1", voiceWav]);
const meanVol = (f, extra = []) => { const r = spawnSync(FF, ["-hide_banner", "-i", f, ...extra, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }); return parseFloat((r.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/) || [0, -30])[1]); };
const BED = "/Users/cawc/Hackathons/CF Newgit/gadgethub/video/build/audio_open_bed_raw.wav";
const vMean = meanVol(voiceWav), bMean = meanVol(BED);
// voice mean includes silence between lines; measure speech-only by scaling with the speech fraction
const speech = beats.reduce((s, b) => s + b.dur, 0), frac = speech / total;
const vSpeech = vMean - 10 * Math.log10(frac);
const bedGain = vSpeech - 14 - bMean;
console.log(`voice speech mean ${vSpeech.toFixed(1)} dB, bed mean ${bMean.toFixed(1)} dB, bed gain ${bedGain.toFixed(1)} dB`);
run(FF, ["-y", "-loglevel", "error", "-i", voiceWav, "-stream_loop", "-1", "-i", BED, "-filter_complex",
  `[1:a]atrim=0:${total.toFixed(3)},volume=${bedGain.toFixed(2)}dB,afade=t=in:d=1.5,afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5[bed];[0:a][bed]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[m]`,
  "-map", "[m]", "-t", total.toFixed(3), P("work/mix.wav")]);
run(FF, ["-y", "-loglevel", "error", "-i", P("work/video_only.mp4"), "-i", P("work/mix.wav"), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", P("out/walkthrough.mp4")]);
fs.writeFileSync(P("out/beats.json"), JSON.stringify(beats.map((b) => ({ id: b.id, start: +b.start.toFixed(2), len: +b.len.toFixed(2), speed: +b.speed.toFixed(2) })), null, 1));
console.log("wrote out/walkthrough.mp4", total.toFixed(1), "s");
