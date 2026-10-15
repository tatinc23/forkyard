// node capture_review.mjs <jobId> : re-attach to the live job (which waits at "awaiting sign-off") and record the review + payout beats.
// Same rig as capture.mjs. Review beats: triage groups, a chapter with a visible change (Lens, Blend, X-ray), reject a flagged chapter, sign off, Ledger.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, demoKey, BASE } from "./rig.mjs";

const JOB = process.argv[2];
const VISUAL_AGENT = process.argv[3] || "Vanta";
const REJECT_AGENT = process.argv[4] || "Forge";
if (!/^[a-z0-9]{8}$/.test(JOB || "")) throw new Error("usage: node capture_review.mjs <jobId> [visualAgent] [rejectAgent]");
const OUT = fileURLToPath(new URL("./out/review/", import.meta.url));
const r = await launch(OUT);
const { page, mark, clickEl, hoverEl, byText, sel1, moveTo, center } = r;
const log = (...a) => console.log("[cap]", ...a);
const hold = (s) => r.sleep(s * 1000);
async function step(name, fn) {
  try { return await fn(); } catch (e) { log("STEP FAILED", name, String(e.message).slice(0, 300)); await r.shot(`${OUT}fail_${name}.png`).catch(() => {}); }
}

await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
await r.setKey(demoKey());
await page.goto(`${BASE}/?job=${JOB}`, { waitUntil: "networkidle2" });
await r.start();
await hold(2);
mark("review", "start");
await sel1(".tri", 60000);
await hold(4); // the hand-off animation settles
const chapterBy = (n) => page.evaluateHandle((n) => [...document.querySelectorAll(".tri-i")].find((b) => (b.getAttribute("aria-label") || "").includes(n)) || null, n).then((h) => h.asElement());

mark("exceptions", "start");
await step("triage", async () => { for (const c of await page.$$(".tri-col h3")) { await hoverEl(c, { dx: 40 }); await hold(2.2); } });
mark("exceptions", "end");

await step("open-visual", async () => {
  const t = await chapterBy(VISUAL_AGENT);
  log("opening", await t.evaluate((e) => e.getAttribute("aria-label")));
  await clickEl(t); await hold(2.5);
  await sel1(".cmp", 30000);
  await hold(5);
});
mark("visual", "start");
await step("visual", async () => {
  const stage = await sel1(".cmp-stage");
  const lens = await byText(".cmp-bar [role=radio]", /^\s*Lens/);
  await clickEl(lens); await hold(0.8);
  const b = (await center(stage)).b;
  await moveTo(b.x + b.width * 0.25, b.y + b.height * 0.45, 600);
  await page.mouse.down();
  await moveTo(b.x + b.width * 0.7, b.y + b.height * 0.5, 1800);
  await moveTo(b.x + b.width * 0.5, b.y + b.height * 0.35, 1200);
  await page.mouse.up(); await hold(1);
  const blend = await byText(".cmp-bar [role=radio]", /^\s*Blend/);
  await clickEl(blend); await hold(1);
  const rng = await page.$('.cmp input[type=range][aria-label^="Fade"]');
  if (rng) {
    const rb = (await center(rng)).b;
    await moveTo(rb.x + rb.width * 0.55, rb.y + rb.height / 2, 500);
    await page.mouse.down(); await moveTo(rb.x + rb.width * 0.95, rb.y + rb.height / 2, 1200); await moveTo(rb.x + rb.width * 0.1, rb.y + rb.height / 2, 1600); await page.mouse.up();
    await hold(1);
  }
  const xr = await byText(".cmp-bar [role=radio]", /^\s*X-ray/);
  await clickEl(xr); await hold(4);
});
mark("visual", "end");

mark("revert", "start");
await step("reject", async () => {
  const tgt = await chapterBy(REJECT_AGENT);
  await page.evaluate(() => document.querySelector(".tri")?.scrollIntoView({ block: "start" }));
  await hold(0.6);
  await clickEl(tgt); await hold(3.5);
  log("rejecting", await tgt.evaluate((e) => e.getAttribute("aria-label")));
  const rej = await byText(".chap .decide-btns .btn.no", /Reject/);
  await clickEl(rej);
  await page.waitForSelector(".chap .decide-note", { visible: true, timeout: 5000 }).catch(() => {});
  await hold(4);
  await r.shot(`${OUT}rejected.png`);
});
mark("revert", "end");

mark("signoff", "start");
await step("approve-rest", async () => {
  for (let guard = 0; guard < 6; guard++) {
    let target = null;
    for (const it of await page.$$(".tri-col.g-needs .tri-i")) { if (!(await it.$(".tri-d.approve, .tri-d.reject"))) { target = it; break; } }
    if (!target) break;
    await clickEl(target); await hold(1.5);
    const ok = await byText(".chap .decide-btns .btn.ok", /Approve/);
    await clickEl(ok); await hold(1);
  }
  await page.evaluate(() => document.querySelector(".tri")?.scrollIntoView({ block: "start" }));
  await hold(0.6);
  const auto = await page.$('[data-testid="approve-auto"]');
  if (auto && !(await auto.evaluate((e) => e.disabled))) { await clickEl(auto); await hold(1.5); }
});
await step("signoff", async () => {
  const go = await page.waitForFunction(() => { const b = [...document.querySelectorAll(".rail .btn.go")].find((x) => /Approve .*pay|Approve & pay/i.test(x.textContent)); return b && !b.disabled ? b : null; }, { timeout: 30000 });
  const btn = go.asElement();
  await hoverEl(btn); await hold(2.5);
  await clickEl(btn);
});
mark("signoff", "end");

mark("payouts", "start");
await step("ledger", async () => {
  await page.waitForSelector(".cc-ledger", { visible: true, timeout: 90000 });
  await hold(8);
  for (let i = 0; i < 60; i++) { const j = await (await fetch(`${BASE}/api/jobs/${JOB}`)).json(); if (j.status === "closed") break; await hold(1); }
  await hold(7);
});
mark("payouts", "end");
await r.finish();
