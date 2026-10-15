// node render.mjs --seg open|hood|close [--reduced] [--workers 3] [--out build/video_noaudio.mp4] [--from 0] [--to 4500]
// Headless Chrome steps t = n/60, paints via window.seek(t), pipes PNG frames into ffmpeg (libx264, crf 16, yuv420p).
import puppeteer from "puppeteer-core"; import path from "node:path"; import fs from "node:fs"; import { spawn } from "node:child_process";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const reduced = process.argv.includes("--reduced");
const SEG = arg("--seg", "open");
const SEGDUR = { open: 96, hood: 43, close: 15.6 };
const FPS = 60, DUR = SEGDUR[SEG], workers = +arg("--workers", 3);
const from = +arg("--from", 0), to = +arg("--to", Math.round(FPS * DUR));
const outFile = arg("--out", `build/${SEG}${reduced ? "_reduced" : ""}_noaudio.mp4`);
fs.mkdirSync("build/segs", { recursive: true });
const per = Math.ceil((to - from) / workers);
const t0 = Date.now();
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars", "--font-render-hinting=none", "--disable-lcd-text"] });
async function worker(w) {
  const a = from + w * per, b = Math.min(to, a + per);
  if (a >= b) return null;
  const seg = `build/segs/${SEG}${reduced ? "r" : "m"}_${String(w).padStart(2, "0")}.mp4`;
  const ff = spawn("/usr/local/bin/ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-r", String(FPS),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-g", "60", seg], { stdio: ["pipe", "inherit", "inherit"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  await page.goto("file://" + path.resolve("film.html") + "?render=1&seg=" + SEG + (reduced ? "&reduced=1" : ""));
  await page.waitForFunction("window.__ready === true", { timeout: 30000 });
  for (let n = a; n < b; n++) {
    await page.evaluate((t) => window.seek(t), n / FPS);
    const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 }, optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if ((n - a) % 300 === 0) console.log(`worker ${w}: frame ${n - a}/${b - a}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end(); await new Promise(r => ff.on("close", r)); await page.close();
  return seg;
}
const segs = (await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)))).filter(Boolean);
await browser.close();
const listFile = `build/segs/list_${SEG}${reduced ? "r" : ""}.txt`;
fs.writeFileSync(listFile, segs.map(s => `file '${path.resolve(s)}'`).join("\n"));
await new Promise(r => spawn("/usr/local/bin/ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outFile], { stdio: "inherit" }).on("close", r));
console.log("done", outFile, ((Date.now() - t0) / 1000).toFixed(0) + "s");
