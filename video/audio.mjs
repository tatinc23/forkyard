// node audio.mjs : renders the procedural soundtrack offline in headless Chrome (OfflineAudioContext) -> build/audio_*.wav, sound-cues.json
import puppeteer from "puppeteer-core"; import path from "node:path"; import fs from "node:fs";
const SEG = (process.argv.indexOf("--seg") > -1 ? process.argv[process.argv.indexOf("--seg") + 1] : "open");
fs.mkdirSync("build", { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto("file://" + path.resolve("film.html") + "?render=1&seg=" + SEG);
await page.waitForFunction("window.__ready === true", { timeout: 20000 });
for (const [name, opts] of [["mix", { bed: true, cues: true }], ["bed", { bed: true, cues: false }], ["cues", { bed: false, cues: true }]]) {
  const b64 = await page.evaluate(async (o) => audioToWavBase64(await buildAudio(o)), opts);
  fs.writeFileSync(`build/audio_${SEG}_${name}_raw.wav`, Buffer.from(b64, "base64"));
  console.log("wrote", name);
}
const cues = await page.evaluate(() => cueList());
fs.writeFileSync(`sound-cues_${SEG}.json`, JSON.stringify(cues, null, 1));
console.log("cues:", cues.length);
await browser.close();
