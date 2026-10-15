// Live end-to-end run against the deployed Worker. Usage: node scripts/e2e.mjs [baseUrl]
import { readFileSync } from "node:fs";
const BASE = process.argv[2] ?? "https://gadgethub.chris-d6a.workers.dev";
const KEY = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^DEMO_KEY=(.+)$/m)[1].trim();
const H = { "content-type": "application/json", "x-demo-key": KEY };
const goal = process.argv[3] ?? "Work through BACKLOG.md: fill the waterfall and pairing-tester slots, add motion polish to the specimen cards, a working newsletter endpoint with tests, CI and security headers.";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const { jobId } = await (await fetch(`${BASE}/api/jobs`, { method: "POST", headers: H, body: JSON.stringify({ goal, budget: Number(process.env.BUDGET ?? 2) }) })).json();
console.log(el(), "job", jobId);
let seen = 0;
async function waitFor(statuses) {
  for (;;) {
    const ev = await (await fetch(`${BASE}/api/jobs/${jobId}/events`)).json();
    for (const e of ev.slice(seen)) {
      if (e.type === "typing") continue;
      const { t, jobId: _, type, ...rest } = e;
      console.log(el(), type, JSON.stringify(rest).slice(0, 220));
    }
    seen = ev.length;
    const j = await (await fetch(`${BASE}/api/jobs/${jobId}`)).json();
    if (statuses.includes(j.status)) return j;
    if (Date.now() - t0 > 540000) throw new Error("timeout");
    await sleep(2000);
  }
}
let j = await waitFor(["awaiting_budget", "failed"]);
if (j.status === "failed") process.exit(1);
console.log(el(), "APPROVE BUDGET", j.totalCost);
// EDIT=1 exercises the human override: keep the Foreman's crew, add one task to the first contract and hire Ally
// (Accessibility) with two tasks, the way a person would in the plan editor.
let body;
if (process.env.EDIT) {
  const contracts = j.contracts.map((c, i) => ({
    agentId: c.agentId,
    role: c.role,
    leases: c.paths,
    tasks: [...(c.tasks ?? []).map((t) => ({ title: t.title, ...(t.detail ? { detail: t.detail } : {}) })), ...(i === 0 ? [{ title: "Give every specimen card a visible keyboard focus ring", detail: "Use the existing accent tokens; focus must be visible on the navy and chalk sections." }] : [])],
  }));
  if (!contracts.some((c) => c.agentId === "a11y")) contracts.push({ agentId: "a11y", role: "Accessibility", leases: ["index.html"], tasks: [{ title: "Add a skip-to-content link and landmark labels" }, { title: "Give the mosaic grid an accessible name and per-cell labels" }] });
  body = JSON.stringify({ contracts });
}
const ap = await fetch(`${BASE}/api/jobs/${jobId}/approve-budget`, { method: "POST", headers: H, ...(body ? { body } : {}) });
if (!ap.ok) { console.log(el(), "APPROVE FAILED", ap.status, await ap.text()); process.exit(1); }
j = await waitFor(["awaiting_signoff", "failed"]);
if (j.status === "failed") process.exit(1);
console.log(el(), "SIGN OFF");
const review = await (await fetch(`${BASE}/api/jobs/${jobId}/review`)).json();
console.log(el(), "REVIEW", review.chapters?.length, "chapters,", review.timeline?.length, "timeline items");
for (const c of review.chapters ?? []) console.log("  ", c.agentId, c.role, `${c.tasks.filter((t) => t.status === "done").length}/${c.tasks.length} tasks`, c.beforeSha.slice(0, 7), "->", c.afterSha.slice(0, 7), "|", c.story.slice(0, 90));
// Exercise the audit gate: reject the last chapter if REJECT_LAST=1.
const decisions = {};
if (process.env.REJECT_LAST && review.chapters?.length) decisions[review.chapters[review.chapters.length - 1].contractId] = "reject";
await fetch(`${BASE}/api/jobs/${jobId}/signoff`, { method: "POST", headers: H, body: JSON.stringify({ decisions }) });
j = await waitFor(["closed", "failed"]);
console.log(el(), "DONE", j.status, "preview:", `${BASE}/preview/${jobId}/`);
