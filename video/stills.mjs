// usage: node stills.mjs <outDir> <t1> <t2> ...   [--reduced] [--nocap]
import puppeteer from "puppeteer-core";
import path from "node:path"; import fs from "node:fs";
const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith("--")); const rest = args.filter(a => !a.startsWith("--"));
const out = rest[0]; const times = rest.slice(1).map(Number);
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars", "--font-render-hinting=none", "--disable-lcd-text"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const SEGQ = (flags.find(f => f.startsWith("--seg=")) || "--seg=open").slice(6);
const q = "?render=1&seg=" + SEGQ + (flags.includes("--reduced") ? "&reduced=1" : "") + (flags.includes("--nocap") ? "&captions=0" : "");
page.on("console", m => console.log("[page]", m.text())); page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto("file://" + path.resolve("film.html") + q);
await page.waitForFunction("window.__ready === true", { timeout: 20000 });
for (const t of times) {
  await page.evaluate((t, lab) => { window.seek(t); if (lab) { const c = document.getElementById("c").getContext("2d"); const sc = TIMELINE.scenes.find(s => t >= s.t0 && t < s.t1) || TIMELINE.scenes.at(-1); const txt = `${sc.id}  t=${t.toFixed(2)}s`; c.save(); c.font = "600 34px 'JetBrains Mono'"; c.fillStyle = "#1F1A14"; c.fillRect(1920 - 330, 24, 306, 52); c.fillStyle = "#FBF7F0"; c.textAlign = "right"; c.fillText(txt, 1920 - 40, 60); c.restore(); } }, t, flags.includes("--label"));
  const el = await page.$("#c");
  await el.screenshot({ path: path.join(out, `t${t.toFixed(2).padStart(6, "0")}.png`) });
}
await browser.close();
console.log("wrote", times.length, "stills to", out);
