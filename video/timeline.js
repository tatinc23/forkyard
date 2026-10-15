// Forkyard film (v3): the one TIMELINE object. Every beat, move and sound cue is derived from this data; captions come from vo.json.
// `ev` below is the v2 world's event table (the 5-agent crew, the queue, the visual review, the pay beat), kept as-is and replayed through segs.open.pieces.
// Times in `ev` are v2 world seconds; film.js maps open-segment time to world time.
(function (g) {
  const AGENTS = ["vanta", "pixel", "forge", "probe", "rivet"]; // lane order = crew order: Front-end, Motion, Back-end, QA, Platform
  const TASKS = [9, 8, 9, 8, 9];                                  // task commits per lane; total 43 (the pinned AI crew run, job 1aec47b1; the split is illustrative)

  // Per-lane task-commit landing times: a deterministic function of (lane, task), no randomness.
  const commits = AGENTS.map((_, i) => Array.from({ length: TASKS[i] }, (__, j) =>
    +(26.8 + 0.1 * i + j * (5.0 / TASKS[i]) + 0.1 * Math.sin(3.1 * j + 1.9 * i)).toFixed(2)));

  const TIMELINE = {
    dur: 96,   // overwritten per segment below
    fps: 60,
    agents: AGENTS,
    tasks: TASKS,

    // ---- segments (v3). Times are seconds on each segment's own clock. See STORYBOARD.md. ----
    // `world` pieces replay the v2 painter's world at mapped time w (map = [[open t, world t], ...], piecewise linear);
    // the scale piece, the hood segment and the close are new painters in film.js.
    segs: {
      open: {
        dur: 96.0,
        pieces: [
          { id: "hook+fork", kind: "world", o0: 0, o1: 15.2, map: [[0, 0], [8.2, 7.2], [15.2, 13.0]] },
          { id: "crew", kind: "world", o0: 15.2, o1: 24.2, map: [[15.2, 26.0], [24.2, 33.2]], fade: 0.35 },
          { id: "queue", kind: "world", o0: 24.2, o1: 33.4, map: [[24.2, 36.4], [33.4, 44.2]], fade: 0.3 },
          { id: "scale", kind: "scale", o0: 33.4, o1: 82.4, fade: 0.5 },
          { id: "review+pay", kind: "world", o0: 82.4, o1: 96.0, map: [[82.4, 44.2], [90.9, 52.0], [96.0, 56.0]], fade: 0.35 }
        ],
        // scale scene sub-beats (absolute open time)
        sc: { a: [33.4, 39.6], b: [39.6, 46.0], c: [46.0, 61.0], d: [61.0, 70.6], e: [70.6, 76.0], f: [76.0, 82.4] },
        headline: [
          [0.2, 3.8, "Built for people taking turns."],
          [4.0, 9.9, "Agents don't take turns."],
          [10.0, 15.0, "A fork per agent."],
          [15.4, 24.0, "A crew, working at once."],
          [24.4, 33.2, "A queue lands them one by one."],
          [33.8, 39.5, "Now scale it."],
          [39.8, 45.9, "{SCALE.agents} agents, {SCALE.agents} forks."],
          [46.2, 60.9, "A merge tree, not a queue."],
          [61.2, 70.5, "Five levels of ten."],
          [70.8, 73.7, "Can a human watch {SCALE.agents} agents?"],
          [73.8, 82.2, "You watch exceptions."],
          [82.6, 90.6, "A live before and after."],
          [91.0, 96.0, "Paid only if it merges."]
        ],
        sub: [
          [4.6, 9.9, "A new way for hundreds of thousands of agents to work on changes at once."],
          [10.6, 15.0, "Every agent gets its own copy of the repo."],
          [16.4, 24.0, "Every task is its own commit."],
          [26.0, 33.2, "A conflict is data. The cause resolves it."],
          [34.6, 39.5, "Drag the crew size from {CREW.agents} to {SCALE.agents}."],
          [40.4, 45.9, "Nobody shares a branch, so nobody waits."],
          [47.0, 56.8, "Crews merge in parallel, then into main."],
          [57.2, 60.9, "A conflict goes back to the agent that caused it."],
          [61.8, 70.5, "{DESIGN.agents:n} agents, by design. We ran {SCALE.agents}."],
          [76.6, 82.2, "The Inspector approves the rest."],
          [83.4, 90.6, "Approve it, or reject it and it is reverted."],
          [91.6, 96.0, "Rejected work earns nothing."]
        ]
      },
      hood: {
        dur: 43.0,
        headline: [
          [0.3, 3.7, "Under the hood."],
          [4.0, 19.0, "Artifacts: a fork per agent."],
          [19.2, 24.1, "Durable Objects."],
          [24.3, 30.0, "Our own merge engine."],
          [30.2, 35.7, "Workers AI."],
          [35.9, 43.0, "x402 payouts."]
        ],
        sub: [
          [1.0, 3.7, "All of it runs on Cloudflare."],
          [4.6, 12.8, "A write token that expires with the contract."],
          [13.2, 19.0, "readFile at any sha: time travel."],
          [19.8, 24.1, "A Job per goal. A Desk per agent."],
          [24.9, 30.0, "JSON change sets. Structured conflicts."],
          [30.8, 35.7, "GLM-5.3 Flash."],
          [36.5, 43.0, "Base Sepolia. Testnet."]
        ]
      },
      close: {
        dur: 15.6,
        headline: [[0.3, 15.6, "Forkyard"]],
        sub: [[1.0, 15.6, "Source control for agent crews."]]
      }
    },

    // ---- timed events shared by drawing and sound ----
    ev: {
      // S1: three human commits land one at a time, then four agents drop at once (three rounds)
      humanBars: [0.3, 1.1, 1.9],
      rounds: [3.6, 4.8, 5.9],
      roundOffsets: [[-110, 40, -40, 100], [80, -100, 30, -60], [-50, 100, -110, 20]],
      splitT: [7.2, 9.4],        // shared repo splits into main + one fork per agent
      goalT: 13.8,               // goal card arrives
      chipT: 16.0,               // lease chips leave the goal card
      approvePlanT: 18.0,        // human approves plan + budget
      hallT: 19.4,               // Hall cards appear
      pickT: [21.3, 21.6, 21.9, 22.2, 22.5], // Foreman hires each agent (agent moves to its lane header)
      tokenT: [22.9, 23.05, 23.2, 23.35, 23.5], // write token appears
      tokenDrain: [23.5, 55.3],  // token timer runs for the life of the contract
      // S5: one commit per task, per lane (counts 8,7,8,7,7 = 37)
      commits,
      stampT: [27.6, 32.9],
      // S6: Inspector visits each lane
      inspVisit: [33.7, 34.2, 34.7, 35.2, 35.7],
      // S7: lift times (queue order V, F, P(robe), R, then Pixel last); packet takes 1.8 s to reach main
      lift: { vanta: 36.6, forge: 37.0, probe: 37.4, rivet: 37.8, pixel: 38.2 },
      causer: "pixel",           // the agent that causes the conflict (collides with Vanta's merged work)
      conflictT: 40.0,
      cardT: [40.1, 42.0],
      returnT: [41.9, 42.6],
      resolveT: 42.7,
      relandT: [42.9, 44.1],
      leaseRelT: [43.6, 44.2],
      // S8: the human visual review (chapters; Lens; approve / reject)
      review: {
        in: [44.2, 44.55],                    // review layer fades in
        out: [51.85, 52.15],                  // and out
        chStart: [44.6, 46.1, 47.6, 49.7, 50.75],  // lens starts moving to this chapter's change
        moveDur: [0.7, 0.6, 0.5, 0.5, 0.55],       // lens travel time per chapter
        verdictT: [45.8, 47.3, 48.5, 50.6, 51.75], // approve / reject lands
        reject: 2,                            // chapter index that is rejected (Forge, Back-end)
        revertT: [48.7, 49.4],                // rejected change is reverted (ring collapses)
        rejectNoteT: 48.9
      },
      // S9: pay
      cursorT: [52.4, 53.2],
      clickT: 53.3,
      coinT0: 53.6,
      expireT: 55.3,
      payees: [0, 1, 3, 4],      // lane indexes paid (lane 2, Forge, was rejected)
      // S10: reputation
      repT: [56.9, 58.0],
      swapT: [58.3, 59.1],
      // S11: the turn
      turnDrops: 59.8,
      turnGap: 0.65,
      reframeT: [63.3, 64.4, 65.5],
      // S12
      payoffT: [67.9, 68.4, 68.9, 69.4],
      motifT: [8.95, 63.25, 67.8]
    }
  };

  const _q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("seg") : null;
  TIMELINE.seg = _q || (g.__SEG || "open");
  TIMELINE.dur = TIMELINE.segs[TIMELINE.seg].dur;
  g.TIMELINE = TIMELINE;
})(typeof window !== "undefined" ? window : globalThis);
