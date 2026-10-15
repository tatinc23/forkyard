// Which footage each walkthrough line sits on. Sources: live = the real AI job (planning -> running, out/live), review = the same job's review and
// payout beats (out/review, recorded after the run, job 28705935), static = landing, repo, the 100-agent replay and the Hall (out/static).
// A cut is {src, t0, t1, speed?}. A cut with a speed keeps it; cuts without one share whatever time is left in the beat (time-lapse if longer, hold if shorter).
export function makePlan({ T, EV, SRC }) {
  const L = (name, phase, off = 0) => T("live", name, phase, off);
  const R = (name, phase, off = 0) => T("review", name, phase, off);
  const S = (name, phase, off = 0) => T("static", name, phase, off);
  const lv = (t0, t1, speed) => ({ src: "live", t0, t1, ...(speed ? { speed } : {}) });
  const rv = (t0, t1, speed) => ({ src: "review", t0, t1, ...(speed ? { speed } : {}) });
  const st = (t0, t1, speed) => ({ src: "static", t0, t1, ...(speed ? { speed } : {}) });
  const bad = SRC.live.events.filter((e) => e.type === "review" && e.score < 3).map((e) => e.t / 1000);
  const ack = SRC.live.marks.find((m) => m.name === "focus" && m.phase === "ack");
  return {
    "walk.01": { cuts: [st(S("landing", "start"), S("landing", "end"))] },
    "walk.02": { cuts: [st(S("repo", "start"), S("repo", "end"))] },
    "walk.03": { cuts: [lv(L("goal", "start"), L("goal", "start", 2.5), 1), lv(L("goal", "start", 2.5), L("goal", "end", -2)), lv(L("goal", "end", -2), L("goal", "end"), 1)] },
    "walk.04": { cuts: [lv(L("plan", "start", 2), L("plan", "ready", -0.5)), lv(L("plan", "ready", -0.5), L("plan", "end"), 1)] },
    "walk.05": { cuts: [lv(L("override", "start"), L("override", "end"))] },
    "walk.06": { cuts: [lv(L("approve", "start"), L("approve", "end")), lv(L("crew", "start"), L("crew", "start", 5))] },
    "walk.07": { cuts: [lv(L("crew", "start", 5), L("crew", "end")), lv(L("focus", "end", 0), L("focus", "end", 12))] },
    "walk.08": { cuts: [lv(L("focus", "start"), L("focus", "end", -1))] },
    "walk.09": { cuts: [lv(bad[0] - 3, bad[bad.length - 1] + 7)] },
    "walk.10": { cuts: [st(S("scale", "start"), S("scale", "tree"))] },
    "walk.11": { cuts: [st(S("scale", "tree"), S("scale", "end"))] },
    "walk.12": { cuts: [rv(R("exceptions", "start"), R("exceptions", "end"))] },
    "walk.13": { cuts: [rv(R("visual", "start"), R("visual", "end"))] },
    "walk.14": { cuts: [rv(R("revert", "start"), R("revert", "end"))] },
    "walk.15": { cuts: [rv(R("signoff", "end", -3), R("payouts", "end"))] },
    "walk.16": { cuts: [st(S("hall", "start"), S("hall", "end"))] },
  };
}
