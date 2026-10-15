// node determinism.mjs [--seg open|hood|close] <t1> <t2> ... : render each frame in two separate headless-Chrome launches (plus a fresh page with no prior seeks) and compare MD5.
import puppeteer from "puppeteer-core"; import path from "node:path"; import fs from "node:fs"; import crypto from "node:crypto";
const si = process.argv.indexOf("--seg"); const SEG = si > -1 ? process.argv[si + 1] : "open";
const times = process.argv.slice(2).filter((a, i, arr) => a !== "--seg" && arr[i - 1] !== "--seg").map(Number);
fs.mkdirSync("verify/determinism", { recursive: true });
async function run(tag, order, fresh) {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars", "--font-render-hinting=none", "--disable-lcd-text"] });
  const out = {};
  for (const t of order) {
    const page = await browser.newPage(); await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto("file://" + path.resolve("film.html") + "?render=1&seg=" + SEG); await page.waitForFunction("window.__ready === true");
    if (!fresh) for (const w of [1.0, 70.0, 20.0]) await page.evaluate((x) => window.seek(x), w);   // scramble prior state
    await page.evaluate((x) => window.seek(x), t);
    const buf = await (await page.$("#c")).screenshot({ type: "png" });
    fs.writeFileSync(`verify/determinism/${SEG}_${tag}_t${t.toFixed(2)}.png`, buf);
    out[t] = crypto.createHash("md5").update(buf).digest("hex"); await page.close();
  }
  await browser.close(); return out;
}
const A = await run("runA", times, false), B = await run("runB", [...times].reverse(), false), C = await run("runC", times, true);
let lines = [];
for (const t of times) lines.push(`t=${t.toFixed(2)}  runA MD5=${A[t]}  runB MD5=${B[t]}  fresh-page MD5=${C[t]}  ${A[t] === B[t] && A[t] === C[t] ? "IDENTICAL (order-independent)" : "DIFFERENT"}`);
fs.writeFileSync(`verify/determinism_${SEG}.txt`, lines.join("\n") + "\n"); console.log(lines.join("\n"));
