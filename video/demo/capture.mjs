// node capture.mjs live   : post ONE real AI job on the deployed app and drive it end to end (goal -> plan -> override -> approve -> crew -> focus -> ... -> payouts)
// node capture.mjs static : landing, repo page, 100-agent replay (swarm + merge tree), Hall
// node capture.mjs mock   : same driving script as `live` against the offline demo (?mock=1), for rehearsing selectors. No key, no cost.
// Output: out/<mode>/frames/*.jpg + out/<mode>/frames.json (frame timestamps + named marks) + events.json (live job events). assemble.mjs cuts the beats.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, demoKey, BASE, sleep } from "./rig.mjs";

const MODE = process.argv[2] || "live";
const OUT = fileURLToPath(new URL(`./out/${MODE}/`, import.meta.url));
const GOAL = "Work through BACKLOG.md: fill the waterfall and pairing-tester slots, motion polish for the specimen cards, the newsletter endpoint with tests, CI and security headers.";
const NOTE = "Keep the motion subtle and respect reduced motion.";
const TASK = "Check that every animation stops under prefers-reduced-motion";

const r = await launch(OUT);
const { page, mark, clickEl, hoverEl, typeText, byText, tryText, sel1, smoothScroll, moveTo, center } = r;
const log = (...a) => console.log("[cap]", ...a);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

// run a beat step; a failure is logged with a screenshot, never fatal (the job keeps running and keeps being recorded)
async function step(name, fn) {
  try { return await fn(); } catch (e) {
    log("STEP FAILED", name, String(e.message).replace(/x-demo-key[^\s]*/gi, "").slice(0, 300));
    await r.shot(`${OUT}fail_${name}.png`).catch(() => {});
    return undefined;
  }
}
const hold = (s) => sleep(s * 1000);

async function staticBeats() {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await r.start();
  await hold(1);
  // landing: the hero loop (11 s) plays; the cursor drifts to the beat tabs and back
  mark("landing", "start");
  await moveTo(1100, 480, 900);
  await hold(5);
  const beats = await page.$$(".beats .beat");
  if (beats[1]) { await hoverEl(beats[1]); await hold(1.5); }
  await moveTo(1000, 640, 1200);
  await hold(8);
  mark("landing", "end");

  // repo: the Code tab with the site preview
  mark("repo", "start");
  const code = await tryText("a, button", /^\s*Code\b/i, 3000);
  if (code) { await clickEl(code); } else { await page.evaluate(() => (location.hash = "#/code")); }
  await hold(2.5);
  await smoothScroll(420, 1400);
  await hold(3);
  await smoothScroll(500, 1600);
  await hold(3.5);
  mark("repo", "end");
  await page.evaluate(() => (location.hash = "#/")); await page.evaluate(() => scrollTo(0, 0)); await hold(1);

  // scale: the pinned 100-agent replay
  mark("scale", "start");
  const w = await byText("button", /Watch 100 agents/i);
  await clickEl(w);
  await page.waitForSelector(".cmd", { visible: true, timeout: 30000 });
  mark("scale", "loaded");
  await hold(4);
  // 2x speed
  const x2 = await tryText(".seg button[role=radio]", /^2x$/, 4000);
  if (x2) await clickEl(x2);
  // follow it through: the run switches to the merge tree itself when merging starts; record until it is done
  const t0 = Date.now();
  let sawTree = false;
  while (Date.now() - t0 < 200000) {
    const st = await page.evaluate(() => ({ tab: document.querySelector('.tabs [role=tab][aria-selected=true]')?.textContent || "", done: /Finished|signed|Paid|closed/i.test(document.querySelector(".stg li[data-state=now]")?.textContent || "") , stg: document.querySelector(".stg li[data-state=now]")?.textContent || "", cnt: document.querySelector(".cnt")?.textContent || "" }));
    if (/Merge tree/.test(st.tab) && !sawTree) { sawTree = true; mark("scale", "tree"); log("tree view reached", st.stg); }
    if (/9\s*Merged|Merged\s*100/i.test(st.cnt.replace(/\s+/g, " ")) || /Pay/.test(st.stg)) { log("replay done-ish", st.cnt); break; }
    await hold(2);
  }
  await hold(5);
  mark("scale", "end");
  await r.shot(`${OUT}scale_end.png`);
  // the Needs-you column at the end
  mark("exceptions", "start");
  const ny = await page.$(".ny");
  if (ny) await hoverEl(ny, { dx: -40, dy: -120 });
  await hold(7);
  mark("exceptions", "end");

  // hall
  await page.evaluate(() => (location.hash = "#/hall"));
  const nav = await tryText("a.fyr-item", /^\s*Hall/, 2000);
  mark("hall", "start");
  await hold(2);
  await smoothScroll(500, 1500);
  await hold(3);
  mark("hall", "end");
}

async function liveBeats(live) {
  await page.goto(live ? `${BASE}/` : `${BASE}/?mock=1`, { waitUntil: "networkidle2" });
  if (live) { await r.setKey(demoKey()); await page.reload({ waitUntil: "networkidle2" }); }
  await r.start();
  await hold(1.5);

  let jobId = "";
  page.on("response", async (resp) => {
    try { if (resp.request().method() === "POST" && new URL(resp.url()).pathname === "/api/jobs" && resp.ok()) jobId = (await resp.json()).jobId; } catch {}
  });
  const names = {};
  if (live) { const h = await (await fetch(`${BASE}/api/hall`)).json(); for (const a of h.agents) names[a.id] = a.name; }

  // ---- goal
  mark("goal", "start");
  const post = await byText("button, a", /Post a job/i);
  await hoverEl(post); await hold(0.4);
  await clickEl(post);
  const ta = await sel1(".postjob textarea");
  await clickEl(ta);
  await ta.evaluate((e) => e.select());
  await page.keyboard.press("Backspace");
  await typeText(GOAL, 22);
  await hold(0.6);
  const budget = await sel1(".postjob input.num");
  await clickEl(budget, { dx: 30 });
  await budget.evaluate((e) => e.select());
  await page.keyboard.press("Backspace");
  await typeText("4", 120);
  const vals = await page.evaluate(() => [document.querySelector(".postjob textarea").value, document.querySelector(".postjob input.num").value]);
  if (vals[0] !== GOAL || vals[1] !== "4") throw new Error("goal/budget fields wrong before submit: " + JSON.stringify(vals).slice(0, 120));
  await hold(1);
  const submit = await byText(".postjob button[type=submit]", /Post the job/i);
  await clickEl(submit);
  mark("goal", "end");

  // ---- plan (planning screen, then the editable plan)
  mark("plan", "start");
  await page.waitForSelector(".plan", { visible: true, timeout: 30000 });
  log("planning screen up; job", jobId);
  await page.waitForFunction(() => /Here is the plan for your goal/.test(document.querySelector(".plan h1")?.textContent || ""), { timeout: 240000, polling: 500 });
  mark("plan", "ready");
  await hold(5);
  mark("plan", "end");

  // ---- override: swap an agent, add a task, let the Foreman react, take a one-click fix if offered
  mark("override", "start");
  await step("override", async () => {
    const cards = await page.$$(".pe-card");
    let swapped = false;
    for (const idx of [1, 2, 3, 0, 4]) {
      const card = cards[idx]; if (!card || swapped) continue;
      const btn = await card.$(".pe-bar .btn.ghost.sm:not(.danger)");
      if (!btn) continue;
      await clickEl(btn); await hold(0.9);
      const opt = await card.$(".pe-opt:not(.on):not([disabled])");
      if (!opt) { await clickEl(btn); await hold(0.4); continue; }
      await hoverEl(opt); await hold(0.8);
      await clickEl(opt); swapped = true; await hold(2.2);
    }
    // add a task on the first card
    const add = await byText(".pe-card .pe-link", /Add a task/i);
    await clickEl(add); await hold(0.6);
    const empty = await page.evaluateHandle(() => [...document.querySelectorAll('.pe-tasks input[aria-label^="Task"]')].find((i) => i.value === "") || null);
    const el = empty.asElement();
    if (el) { await clickEl(el); await typeText(TASK, 24); }
    await hold(3.5);
    // the Foreman's reaction, and a one-click fix if it offers one
    const fixBtn = await page.$(".pe-issue .btn.orange");
    if (fixBtn) { await hoverEl(fixBtn); await hold(1.2); await clickEl(fixBtn); await hold(3); }
    else await hold(2);
  });
  mark("override", "end");

  // ---- approve
  mark("approve", "start");
  await step("approve", async () => {
    const ap = await byText(".budget .btn.orange", /Approve/i);
    await hoverEl(ap); await hold(2.5);
    const disabled = await ap.evaluate((e) => e.disabled);
    if (disabled) log("approve button disabled (blocking issue)");
    await clickEl(ap);
  });
  await page.waitForSelector(".cmd", { visible: true, timeout: 60000 });
  await hold(2);
  mark("approve", "end");

  // ---- crew
  mark("crew", "start");
  await page.waitForFunction(() => document.querySelectorAll(".mc").length >= 3, { timeout: 120000, polling: 500 }).catch(() => {});
  await hold(1);
  const cards = await page.$$(".mc");
  if (cards[1]) { await hoverEl(cards[1]); await hold(1.2); }
  if (cards[3]) { await hoverEl(cards[3]); await hold(1.2); }
  await hold(6);
  mark("crew", "end");

  // ---- focus: open a working agent, pause, send a note, wait for the acknowledgement, resume
  mark("focus", "start");
  let focusedName = "";
  await step("focus", async () => {
    let open = await page.$('.mc[data-state="working"] .mc-open') || await page.$(".mc .mc-open");
    if (!open) throw new Error("no agent card");
    await clickEl(open);
    await sel1(".fv");
    focusedName = await page.$eval(".fv-who h2", (e) => e.textContent);
    await hold(4);
    const pause = await byText(".fv-ctl .fv-btn", /^\s*Pause\s*$/);
    await clickEl(pause);
    await page.waitForFunction(() => /Paused/.test(document.querySelector(".fv-ctl")?.textContent || ""), { timeout: 20000 }).catch(() => log("pause hint never showed"));
    await hold(1.5);
    const chat = await sel1(".fv-send textarea");
    await clickEl(chat);
    await typeText(NOTE, 26);
    await hold(0.6);
    const send = await byText(".fv-send button", /Send/);
    await clickEl(send);
    const acked = async (ms) => { try { await page.waitForFunction(() => document.querySelectorAll(".fv-thread .msg.ag").length > 0, { timeout: ms, polling: 400 }); return true; } catch { return false; } };
    let ok = await acked(25000);
    mark("focus", ok ? "acked-paused" : "no-ack-yet");
    const resume = await byText(".fv-ctl .fv-btn", /^\s*Resume\s*$/);
    await clickEl(resume);
    if (!ok) ok = await acked(120000);
    log("agent acknowledged:", ok);
    await hold(3);
    const back = await byText(".fv-back", /Back to the grid/);
    await clickEl(back);
  });
  mark("focus", "end");

  // ---- the run: watch for conflicts and Inspector bounces; record until the review opens
  const events = [];
  let seen = 0, didConflict = false, didInsp = false;
  const t0 = Date.now();
  const poll = async () => {
    if (!jobId) return;
    try {
      const evs = await (await fetch(`${BASE}/api/jobs/${jobId}/events`)).json();
      for (const e of evs.slice(seen)) {
        const slim = { type: e.type, t: e.t, contractId: e.contractId, agentId: e.agentId, status: e.status, score: e.score, paths: e.conflicts?.map((c) => c.path), notes: e.notes?.slice(0, 200), reason: e.reason };
        events.push(slim);
      }
      seen = evs.length;
      fs.writeFileSync(`${OUT}events.json`, JSON.stringify(events));
    } catch {}
  };
  const reviewUp = () => page.$(".tri");
  while (Date.now() - t0 < 25 * 60 * 1000) {
    await poll();
    if (await reviewUp()) break;
    const conflict = events.find((e) => e.type === "conflict");
    if (conflict && !didConflict) {
      didConflict = true;
      mark("conflict", "start");
      await step("conflict", async () => {
        log("conflict seen", conflict.paths);
        await hold(4);
        const tree = await byText('.tabs [role=tab]', /Merge tree/);
        await clickEl(tree); await hold(7);
        const crew = await byText('.tabs [role=tab]', /^\s*Crew/);
        await clickEl(crew); await hold(1);
      });
      mark("conflict", "end");
    }
    const bad = events.find((e) => e.type === "review" && e.score < 3);
    if (bad && !didInsp) {
      didInsp = true;
      mark("inspector", "start");
      await step("inspector", async () => {
        const who = names[bad.agentId] || "";
        log("inspector bounce", who, bad.score);
        const open = await page.evaluateHandle((who) => [...document.querySelectorAll(".mc")].find((c) => c.textContent.includes(who))?.querySelector(".mc-open") || null, who);
        const el = open.asElement();
        if (el) { await clickEl(el); await sel1(".fv"); await hold(1); const insp = await page.$(".fv-insp"); if (insp) await hoverEl(insp); await hold(7); const back = await byText(".fv-back", /Back to the grid/); await clickEl(back); }
      });
      mark("inspector", "end");
    }
    await hold(1.5);
    r.save();
  }
  await poll();
  log("review is up", ((Date.now() - t0) / 1000).toFixed(0), "s after crew");

  // ---- review
  mark("review", "start");
  await sel1(".tri", 60000);
  await hold(4); // entrance animation settles
  await step("triage", async () => {
    for (const c of await page.$$(".tri-col h3")) { await hoverEl(c, { dx: 40 }); await hold(1); }
  });
  mark("review", "triage-done");
  // reject target: a flagged chapter if there is one, else the last auto-approvable
  const pickTarget = async () => {
    const needs = await page.$$(".tri-col.g-needs .tri-i");
    const auto = await page.$$(".tri-col.g-auto .tri-i");
    return needs[0] || auto[auto.length - 1] || null;
  };
  let rejectLabel = "";
  await step("chapter", async () => {
    const t = await pickTarget();
    if (!t) throw new Error("no chapter to open");
    rejectLabel = await t.evaluate((e) => e.getAttribute("aria-label"));
    log("opening", rejectLabel);
    await clickEl(t);
    await hold(2.5);
    await sel1(".cmp", 30000);
    await page.waitForFunction(() => !document.querySelector(".cmp .cmp-load, .cmp [aria-busy=true]"), { timeout: 20000 }).catch(() => {});
    await hold(2);
  });
  mark("visual", "start");
  await step("visual", async () => {
    const stage = await sel1(".cmp-stage");
    const lens = await byText(".cmp-bar [role=radio]", /^\s*Lens/);
    await clickEl(lens); await hold(0.8);
    const b = await (await center(stage)).b;
    await moveTo(b.x + b.width * 0.25, b.y + b.height * 0.45, 600);
    await page.mouse.down();
    await moveTo(b.x + b.width * 0.7, b.y + b.height * 0.5, 1800);
    await moveTo(b.x + b.width * 0.5, b.y + b.height * 0.35, 1200);
    await page.mouse.up(); await hold(1);
    const blend = await byText(".cmp-bar [role=radio]", /^\s*Blend/);
    await clickEl(blend); await hold(1);
    const rng = await page.$('.cmp input[type=range][aria-label^="Fade"]');
    if (rng) {
      const rb = await (await center(rng)).b;
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
    const rej = await byText(".chap .decide-btns .btn.no", /Reject/);
    await clickEl(rej);
    await page.waitForSelector(".chap .decide-note", { visible: true, timeout: 5000 }).catch(() => {});
    await hold(3);
    await r.shot(`${OUT}rejected.png`);
  });
  mark("revert", "end");
  mark("signoff", "start");
  await step("approve-rest", async () => {
    // decide every other flagged chapter, then approve all auto-approvable ones
    for (let guard = 0; guard < 6; guard++) {
      const pending = await page.$$(".tri-col.g-needs .tri-i .tri-d:not(.approve):not(.reject)");
      if (!pending.length) break;
      const items = await page.$$(".tri-col.g-needs .tri-i");
      let target = null;
      for (const it of items) { const d = await it.$(".tri-d.approve, .tri-d.reject"); if (!d) { target = it; break; } }
      if (!target) break;
      await clickEl(target); await hold(1.5);
      const ok = await byText(".chap .decide-btns .btn.ok", /Approve/);
      await clickEl(ok); await hold(1);
    }
    const auto = await page.$('[data-testid="approve-auto"]');
    if (auto && !(await auto.evaluate((e) => e.disabled))) { await clickEl(auto); await hold(1.5); }
  });
  await step("signoff", async () => {
    const go = await page.waitForFunction(() => { const b = [...document.querySelectorAll(".rail .btn.go")].find((x) => /Approve .*pay|Approve & pay/i.test(x.textContent)); return b && !b.disabled ? b : null; }, { timeout: 30000 });
    const btn = go.asElement();
    await hoverEl(btn); await hold(2);
    await clickEl(btn);
  });
  mark("signoff", "end");

  // ---- payouts (the command center flips to the Ledger itself after sign-off)
  mark("payouts", "start");
  await step("ledger", async () => {
    await page.waitForSelector(".cc-ledger", { visible: true, timeout: 90000 });
    await hold(8);
    if (jobId) for (let i = 0; i < 40; i++) { const j = await (await fetch(`${BASE}/api/jobs/${jobId}`)).json(); if (j.status === "closed") break; await hold(1); }
    await hold(6);
  });
  mark("payouts", "end");
  await poll();
  fs.writeFileSync(`${OUT}summary.json`, JSON.stringify({ jobId, focusedName, rejectLabel, errors }, null, 1));
}

try {
  if (MODE === "static") await staticBeats();
  else await liveBeats(MODE === "live");
} catch (e) {
  log("FATAL", String(e.stack || e).replace(/x-demo-key[^\s]*/gi, "").slice(0, 800));
  await r.shot(`${OUT}fatal.png`).catch(() => {});
} finally {
  await r.finish();
  if (errors.length) log("page errors:", errors.slice(0, 5));
}
