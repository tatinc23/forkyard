// node flash.mjs <video.mp4> : per-frame mean luma (64x36 gray decode); reports the largest frame-to-frame change and frames above 10 %.
import { spawnSync } from "node:child_process"; import fs from "node:fs";
const f = process.argv[2], W = 64, H = 36;
const r = spawnSync("/usr/local/bin/ffmpeg", ["-v", "error", "-i", f, "-vf", `scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
const b = r.stdout, n = Math.floor(b.length / (W * H)); let prev = null, mx = 0, over = 0, mxAt = 0;
for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < W * H; j++) s += b[i * W * H + j]; const m = s / (W * H) / 255; if (prev !== null) { const d = Math.abs(m - prev); if (d > mx) { mx = d; mxAt = i; } if (d > 0.1) over++; } prev = m; }
const out = { file: f, frames: n, maxFrameToFramePct: +(mx * 100).toFixed(2), atFrame: mxAt, framesOver10pct: over };
console.log(JSON.stringify(out)); fs.mkdirSync("verify", { recursive: true }); fs.appendFileSync("verify/flash.jsonl", JSON.stringify(out) + "\n");
