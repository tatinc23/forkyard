// Spike: measure CDP screencast frame rate of the live app at 1920x1080 in headless Chrome.
import puppeteer from "../../video/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--window-size=1920,1080", "--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto("https://gadgethub.chris-d6a.workers.dev/?replay=1", { waitUntil: "networkidle2" });
const cdp = await page.createCDPSession();
let n = 0; const ts = [];
cdp.on("Page.screencastFrame", async (f) => { ts.push(f.metadata.timestamp); fs.writeFileSync(`${out}/f${String(n++).padStart(5, "0")}.jpg`, Buffer.from(f.data, "base64")); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await new Promise((r) => setTimeout(r, 10000));
await cdp.send("Page.stopScreencast");
await browser.close();
const span = ts[ts.length - 1] - ts[0];
console.log(`frames ${n} over ${span.toFixed(2)} s = ${(n / span).toFixed(1)} fps`);
