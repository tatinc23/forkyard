// Capture rig for the walkthrough: headless Chrome at 1920x1080, CDP screencast of every frame (with wall-clock timestamps),
// a visible synthetic cursor, human-paced mouse/typing helpers, and named time marks that assemble.mjs cuts clips from.
// Nothing here prints, logs or writes the demo key.
import puppeteer from "../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASE = "https://gadgethub.chris-d6a.workers.dev";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const CURSOR_JS = `(() => {
  const mk = () => {
    if (document.getElementById("__cur")) return;
    const st = document.createElement("style");
    st.textContent = '#__cur{position:fixed;left:0;top:0;width:30px;height:30px;pointer-events:none;z-index:2147483647;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}' +
      '#__cur svg{display:block;transition:transform .12s ease-out;transform-origin:4px 3px}#__cur.down svg{transform:scale(.82)}' +
      '#__cur i{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:3px solid #F6821F;opacity:0;transform:scale(.4)}' +
      '#__cur.ping i{animation:__ping .55s ease-out}@keyframes __ping{0%{opacity:.95;transform:scale(.4)}100%{opacity:0;transform:scale(1.9)}}';
    document.documentElement.appendChild(st);
    const c = document.createElement("div"); c.id = "__cur";
    c.innerHTML = '<i></i><svg width="30" height="30" viewBox="0 0 30 30"><path d="M4 2.5 L4 22 L9.2 17.4 L12.6 25.2 L16.2 23.7 L12.8 16 L19.8 15.6 Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const place = (x, y) => { c.style.transform = "translate(" + x + "px," + y + "px)"; };
    place(window.__cx ?? 960, window.__cy ?? 560);
    addEventListener("mousemove", (e) => { window.__cx = e.clientX; window.__cy = e.clientY; place(e.clientX, e.clientY); }, true);
    addEventListener("mousedown", () => { c.classList.add("down"); c.classList.remove("ping"); void c.offsetWidth; c.classList.add("ping"); }, true);
    addEventListener("mouseup", () => c.classList.remove("down"), true);
  };
  if (document.documentElement) mk(); else document.addEventListener("DOMContentLoaded", mk);
  document.addEventListener("DOMContentLoaded", mk);
})();`;

export async function launch(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const framesDir = path.join(outDir, "frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--window-size=1920,1080", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", "--disable-features=Translate"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(CURSOR_JS);
  const cdp = await page.createCDPSession();
  const frames = []; // {t: epoch seconds, f: file}
  let n = 0;
  cdp.on("Page.screencastFrame", (fr) => {
    const f = `f${String(n++).padStart(6, "0")}.jpg`;
    frames.push({ t: fr.metadata.timestamp, f });
    fs.promises.writeFile(path.join(framesDir, f), Buffer.from(fr.data, "base64")).catch(() => {});
    cdp.send("Page.screencastFrameAck", { sessionId: fr.sessionId }).catch(() => {});
  });
  const marks = []; // {name, phase, t}
  const mark = (name, phase) => { marks.push({ name, phase, t: Date.now() / 1000 }); console.log(`[mark] ${name} ${phase} (+${(Date.now() / 1000 - T0).toFixed(1)}s)`); };
  let T0 = Date.now() / 1000;
  const start = async () => { T0 = Date.now() / 1000; await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }); };
  const save = () => fs.writeFileSync(path.join(outDir, "frames.json"), JSON.stringify({ frames, marks }));
  const finish = async () => {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await sleep(1200);
    save();
    await browser.close().catch(() => {});
    console.log(`frames ${frames.length}, span ${(frames.at(-1)?.t - frames[0]?.t).toFixed(1)} s`);
  };

  let cur = { x: 960, y: 560 };
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const moveTo = async (x, y, ms) => {
    const dist = Math.hypot(x - cur.x, y - cur.y);
    const dur = ms ?? Math.min(900, 260 + dist * 0.55);
    const steps = Math.max(8, Math.round(dur / 14));
    const x0 = cur.x, y0 = cur.y;
    // a slight arc so it reads as a hand, not a robot
    const nx = -(y - y0) / (dist || 1), ny = (x - x0) / (dist || 1), bow = Math.min(40, dist * 0.06);
    for (let i = 1; i <= steps; i++) {
      const u = ease(i / steps), arc = Math.sin(Math.PI * u) * bow;
      await page.mouse.move(x0 + (x - x0) * u + nx * arc, y0 + (y - y0) * u + ny * arc);
      await sleep(dur / steps);
    }
    cur = { x, y };
  };
  const center = async (el) => {
    await el.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
    await sleep(120);
    const b = await el.boundingBox();
    if (!b) throw new Error("element has no box");
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
  };
  const clickEl = async (el, { dx = 0, dy = 0, pause = 220 } = {}) => {
    const { x, y } = await center(el);
    await moveTo(x + dx, y + dy);
    await sleep(pause);
    await page.mouse.down();
    await sleep(70);
    await page.mouse.up();
    await sleep(160);
  };
  const hoverEl = async (el, o = {}) => { const { x, y } = await center(el); await moveTo(x + (o.dx ?? 0), y + (o.dy ?? 0)); };
  const typeText = async (text, delay = 26) => { for (const ch of text) { await page.keyboard.type(ch); await sleep(delay + Math.random() * 20); } };

  // first visible element matching selector whose text matches re
  const byText = async (sel, re, timeout = 20000) => {
    const h = await page.waitForFunction(
      (sel, src, flags) => {
        const r = new RegExp(src, flags);
        return [...document.querySelectorAll(sel)].find((e) => r.test(e.textContent || "") && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden") || null;
      },
      { timeout, polling: 200 }, sel, re.source, re.flags,
    );
    return h.asElement();
  };
  const tryText = async (sel, re, timeout = 1500) => { try { return await byText(sel, re, timeout); } catch { return null; } };
  const sel1 = async (sel, timeout = 20000) => { await page.waitForSelector(sel, { visible: true, timeout }); return page.$(sel); };
  const smoothScroll = async (px, ms = 900) => {
    await page.evaluate(async (px, ms) => {
      const y0 = scrollY, t0 = performance.now();
      await new Promise((res) => { const f = (t) => { const u = Math.min(1, (t - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; scrollTo(0, y0 + px * e); u < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    }, px, ms);
  };
  const setKey = async (key) => { await page.evaluate((k) => { try { localStorage.setItem("forkyardKey", k); } catch {} }, key); };
  const shot = (p) => page.screenshot({ path: p });
  return { browser, page, start, finish, save, mark, moveTo, clickEl, hoverEl, typeText, byText, tryText, sel1, smoothScroll, setKey, shot, sleep, getCur: () => cur, setCur: (c) => (cur = c), center };
}

export function demoKey() {
  const txt = fs.readFileSync(fileURLToPath(new URL("../../.dev.vars", import.meta.url)), "utf8");
  const m = txt.match(/^DEMO_KEY=(.*)$/m);
  if (!m) throw new Error("DEMO_KEY missing from .dev.vars");
  return m[1].trim().replace(/^["']|["']$/g, "");
}
