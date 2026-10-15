// Forkyard film: frame painter. window.seek(t) paints the frame at time t (segment clock: ?seg=open|hood|close). Pure function of t, no clocks, no Math.random.
(function () {
  const TL = TIMELINE, EV = TL.ev, C = TOKENS.color, TY = TOKENS.type;
  const Q = new URLSearchParams(location.search);
  const RM = Q.get("reduced") === "1";   // reduced-motion cut: same sequence of ideas, moves become cuts + fades
  const CAPS = Q.get("captions") !== "0";
  const W = 1920, H = 1080;
  const cv = document.getElementById("c");
  let ctx = cv.getContext("2d");   // rebound to an offscreen canvas while a dissolve is composed

  // ---------- math + easing ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  function bez(x1, y1, x2, y2) {
    return (t) => {
      if (t <= 0) return 0; if (t >= 1) return 1;
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 40; i++) {
        const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
        if (Math.abs(x - t) < 1e-6) break;
        if (x < t) lo = u; else hi = u;
        u = (lo + hi) / 2;
      }
      return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
    };
  }
  const M = TOKENS.motion;
  const E = RM
    ? { io: (s) => (s < 0.5 ? 0 : 1), out: (s) => (s < 0.5 ? 0 : 1), in: (s) => (s < 0.5 ? 0 : 1) }
    : { io: bez(...M.inOut), out: bez(...M.out), in: bez(...M.in) };
  const pr = (t, a, b, e) => { const x = clamp((t - a) / (b - a)); return e ? e(x) : x; };
  const win = (t, a, b, fi = 0.3, fo = 0.3) => clamp((t - a) / fi) * clamp((b - t) / fo);

  // ---------- drawing primitives ----------
  function T(str, x, y, o = {}) {
    const { font = TY.mono, size = 34, weight = 400, fill = C.ink, align = "left", alpha = 1 } = o;
    if (alpha <= 0 || ctx.globalAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = fill; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  function box(x, y, w, h, fill, o = {}) {
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (o.stroke !== false) {
      ctx.lineWidth = o.lw ?? 3; ctx.strokeStyle = o.sc ?? C.ink;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
  let hatchPat = null;
  function hatch(x, y, w, h, alpha = 1, bg = C.paper) {
    if (w <= 0 || h <= 0 || alpha <= 0) return;
    if (!hatchPat) {
      const pc = document.createElement("canvas"); pc.width = pc.height = 14;
      const pg = pc.getContext("2d");
      pg.strokeStyle = C.ink; pg.lineWidth = 2.5;
      pg.beginPath(); pg.moveTo(-2, 16); pg.lineTo(16, -2); pg.moveTo(-2, 2); pg.lineTo(2, -2); pg.moveTo(12, 16); pg.lineTo(16, 12); pg.stroke();
      hatchPat = ctx.createPattern(pc, "repeat");
    }
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (bg) { ctx.globalAlpha *= 0.35; ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); ctx.globalAlpha /= 0.35; }
    ctx.fillStyle = hatchPat; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  function panel(r, title, o = {}) {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    box(r.x, r.y, r.w, r.h, o.fill ?? C.paper2, { lw: 3 });
    if (title) T(title, r.x + 22, r.y + 50, { size: 34, alpha: o.titleAlpha ?? 1, fill: C.ink });
    ctx.restore();
  }
  const SHAPES = {
    L: [[0, 0], [0, 1], [0, 2], [1, 2]], T: [[0, 0], [1, 0], [2, 0], [1, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    O: [[0, 0], [1, 0], [0, 1], [1, 1]], J: [[1, 0], [1, 1], [0, 2], [1, 2]], I: [[0, 0], [1, 0], [2, 0], [3, 0]],
    R: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]
  };
  const DIMS = { L: [2, 3], T: [3, 2], S: [3, 2], O: [2, 2], J: [2, 3], I: [4, 1], R: [3, 3] };
  function shapeC(n, cx, cy, u, fill, alpha = 1) {   // centred on (cx,cy)
    const [w, h] = DIMS[n];
    const x0 = cx - (w * u) / 2, y0 = cy - (h * u) / 2;
    ctx.save(); ctx.globalAlpha *= alpha;
    for (const [i, j] of SHAPES[n]) box(x0 + i * u, y0 + j * u, u, u, fill, { lw: Math.max(2, u / 8) });
    ctx.restore();
  }
  function bar(x, y, w, fill, o = {}) {
    const h = 34;
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    box(x, y, w, h, fill, { lw: 3 });
    if (o.label) T(o.label, x + 12, y + 25, { size: 24, fill: fill === C.ink ? C.paper : C.ink, alpha: 1 });
    ctx.restore();
  }
  function checkGlyph(cx, cy, s, col, lw = 5) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "square"; ctx.lineJoin = "miter";
    ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy + s * 0.02); ctx.lineTo(cx - s * 0.12, cy + s * 0.4); ctx.lineTo(cx + s * 0.55, cy - s * 0.38); ctx.stroke();
    ctx.restore();
  }
  function crossGlyph(cx, cy, s, col, lw = 5) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "square";
    ctx.beginPath(); ctx.moveTo(cx - s / 2, cy - s / 2); ctx.lineTo(cx + s / 2, cy + s / 2); ctx.moveTo(cx + s / 2, cy - s / 2); ctx.lineTo(cx - s / 2, cy + s / 2); ctx.stroke();
    ctx.restore();
  }
  function badge(cx, cy, kind, alpha = 1) {   // square badge: check or cross. glyph + shape, never colour alone
    ctx.save(); ctx.globalAlpha *= alpha;
    box(cx - 20, cy - 20, 40, 40, kind === "ok" ? C.ink : C.paper, { lw: 3 });
    if (kind === "ok") checkGlyph(cx, cy, 24, C.paper, 5); else crossGlyph(cx, cy, 20, C.ink, 5);
    ctx.restore();
  }
  function keyGlyph(x, y, fill, alpha = 1) {   // blocky key: head, shaft, two teeth
    ctx.save(); ctx.globalAlpha *= alpha;
    box(x + 18, y + 6, 32, 8, fill, { lw: 2.5 });
    box(x + 32, y + 14, 8, 8, fill, { lw: 2.5 });
    box(x + 44, y + 14, 8, 8, fill, { lw: 2.5 });
    box(x, y, 22, 22, fill, { lw: 3 });
    box(x + 7, y + 7, 8, 8, C.paper, { lw: 2 });
    ctx.restore();
  }
  function cursor(x, y, alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 36); ctx.lineTo(9, 28); ctx.lineTo(15, 42); ctx.lineTo(22, 39); ctx.lineTo(16, 26); ctx.lineTo(28, 26); ctx.closePath();
    ctx.fillStyle = C.ink; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.paper; ctx.stroke();
    ctx.restore();
  }
  const typed = (s, t, t0, cps = 60) => s.slice(0, Math.max(0, Math.floor((t - t0) * cps)));

  // ---------- agents (the crew, in lane order: Front-end, Motion, Back-end, QA, Platform) ----------
  const STONE = "#B8A77F";
  const AG = {
    vanta: { name: "Vanta", role: "Front-end", shape: "L", fill: C.orange, tier: "Custom-trained", file: "sections.css", rep0: 0.892, rep1: 0.91 },
    pixel: { name: "Pixel", role: "Motion", shape: "T", fill: C.yellow, tier: "Custom-trained", file: "motion.js", rep0: 0.818, rep1: 0.81 },
    forge: { name: "Forge", role: "Back-end", shape: "S", fill: C.ink, tier: "Workflow", file: "worker.ts", rep0: 0.905, rep1: 0.78 },
    probe: { name: "Probe", role: "QA", shape: "O", fill: C.sand, tier: "Workflow", file: "site.test.js", rep0: 0.861, rep1: 0.88 },
    rivet: { name: "Rivet", role: "Platform", shape: "J", fill: STONE, tier: "Standard", file: "_headers", rep0: 0.774, rep1: 0.79 }
  };
  const IDS = TL.agents, NA = IDS.length;
  const A = (i) => AG[IDS[i]];
  const RV = EV.review;
  const PAYDIM = [55.9, 56.6], KILL = [59.3, 59.9];   // lanes dim when the leaderboard arrives, vanish when the turn begins
  const CAUSER = IDS.indexOf(EV.causer), REJ = RV.reject;
  const approvedLane = (k) => k !== REJ;              // chapter k == lane k

  // ---------- geometry ----------
  const ST = TOKENS.grid.stage;
  const LP = 272, LW = 256, LI = 24, BW = 208;        // lane pitch, lane width, inner inset, inner bar width
  const SH = { x: 660, y: 285, w: 600, h: 585 }, MAIN = { x: 1488, y: 285, w: 336, h: 585 };
  const LANE = (i) => ({ x: 96 + i * LP, y: 285, w: LW, h: 585 });
  const by = (k) => 725 - 40 * k;                       // bar rest y for stack slot k (bar height 34)
  const taskY = (c) => 618 - 17 * c;                    // task-commit block: small bars, pitch 17, height 13
  const blockTop = (i) => taskY(TL.tasks[i] - 1);
  const pk0 = (i) => taskY((TL.tasks[i] - 1) / 2) + 6.5 - 17;   // top of the single bar the task commits collapse into
  const lerpRect = (a, b, s) => ({ x: lerp(a.x, b.x, s), y: lerp(a.y, b.y, s), w: lerp(a.w, b.w, s), h: lerp(a.h, b.h, s) });
  const splitS = (t) => pr(t, EV.splitT[0], EV.splitT[1], E.io);
  const mainRect = (t) => lerpRect(SH, MAIN, splitS(t));
  const barBox = (r) => { const w = Math.min(300, r.w - 56); return { x: r.x + (r.w - w) / 2, w }; };
  const pulse = (dt) => (dt < 0 || dt > 0.5 ? 0 : dt < 0.1 ? dt / 0.1 : 1 - (dt - 0.1) / 0.4);
  const sbar = (x, y, w, fill, alpha = 1) => { ctx.save(); ctx.globalAlpha *= alpha; box(x, y, w, 13, fill, { lw: 2.5 }); ctx.restore(); };
  const dimAfterPay = (t) => (t >= PAYDIM[0] ? 1 - 0.8 * pr(t, PAYDIM[0], PAYDIM[1]) : 1);

  // ---------- camera ----------
  function camera(t) {
    if (RM) return { s: 1, cx: 960, cy: 580 };
    let s = 1, cx = 960, cy = 580;
    if (t < 9.4) s = lerp(1.06, 1.0, pr(t, 6.9, 9.4, E.io));                       // S1 tight on the pile-up, S2 pulls back
    const c0 = EV.conflictT, r0 = EV.returnT[0];
    if (t >= c0 - 0.6 && t < r0 + 0.6) { const k = pr(t, c0 - 0.5, c0 + 0.2, E.io) * (1 - pr(t, r0 - 0.3, r0 + 0.4, E.io)); s = lerp(1, 1.08, k); cx = lerp(960, 1300, k); cy = lerp(580, 575, k); }
    if (t >= 67.4) { const k = pr(t, 67.4, 75, E.io); s = lerp(1, 1.06, k); }
    return { s, cx, cy };
  }

  // ---------- chaos: agents hitting one shared main (S1 and the left half of the turn) ----------
  function chaos(t, r, times, offs, kBase, opt = {}) {
    const bb = barBox(r);
    const bw = 244;
    for (let ri = 0; ri < times.length; ri++) {
      const td = times[ri], k = kBase + ri;
      const land = td + 0.55;
      const yR = by(k);
      const xs = [];
      for (let i = 0; i < 4; i++) {
        const x = bb.x + (bb.w - bw) / 2 + offs[ri][i] * (opt.spread ?? 1);
        xs.push(x);
      }
      for (let i = 0; i < 4; i++) {
        const a = clamp((t - td) / 0.12) * (opt.alpha ?? 1);
        if (a <= 0) continue;
        const y = lerp(opt.startY ?? r.y + 70, yR, E.io(pr(t, td, land)));
        const sp = opt.splitS ?? 0;                                 // S2: each chaos bar drifts toward its own fork and dissolves
        const x = lerp(xs[i], opt.laneX ? opt.laneX(i) : xs[i], sp);
        ctx.save(); ctx.globalAlpha *= a * (1 - (opt.fade ?? 0));
        bar(x, y, bw, A(i).fill);
        T("?", x + 14, y + 26, { size: 26, fill: A(i).fill === C.ink ? C.paper : C.ink });
        ctx.restore();
      }
      if (!opt.splitS) {
        const ha = pr(t, land, land + 0.25) * (opt.alpha ?? 1);
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
          const x0 = Math.max(xs[i], xs[j]), x1 = Math.min(xs[i], xs[j]) + bw;
          if (x1 > x0) hatch(x0, yR, x1 - x0, 34, ha * 0.9);
        }
        if (ha > 0) { ctx.save(); ctx.globalAlpha *= ha; box(Math.min(...xs), yR, Math.max(...xs) + bw - Math.min(...xs), 34, null, { lw: 3, dash: [10, 6] }); ctx.restore(); }
      }
    }
  }

  // ---------- S1 + S2: shared main splits into main + a fork per agent ----------
  function sceneS1S2(t) {
    if (t >= KILL[1]) return;
    const r = mainRect(t);
    const sp = splitS(t);
    const mainA = 1 - pr(t, KILL[0], KILL[1]);
    ctx.save(); ctx.globalAlpha *= mainA * dimAfterPay(t);
    panel(r, null);
    T("main", r.x + 22, r.y + 50, { size: 34 });
    if (t < 9.0) T("shared by everyone", r.x + 22 + 100, r.y + 50, { size: 26, fill: C.muted, alpha: 1 - pr(t, 7.2, 8.0) });
    // human history: three clean sand bars land one at a time
    const bb = barBox(r);
    for (let k = 0; k < 3; k++) {
      const td = EV.humanBars[k], land = td + 0.5;
      const a = clamp((t - td) / 0.12);
      if (a <= 0) continue;
      const y = lerp(r.y + 70, by(k), E.io(pr(t, td, land)));
      bar(bb.x, y, bb.w, C.sand, { alpha: a });
    }
    // bottom caption inside the panel, stage 1 only
    if (t < 7.2) {
      T("humans, one at a time", r.x + 22, r.y + r.h - 22, { size: 28, fill: C.muted, alpha: win(t, 0.3, 3.5, 0.3, 0.3) });
      T("agents, all at once", r.x + 22, r.y + r.h - 22, { size: 28, fill: C.ink, alpha: win(t, 3.7, 7.0, 0.3, 0.2) });
    }
    ctx.restore();
    // chaos bars
    if (t < 8.8) {
      chaos(t, SH, EV.rounds, EV.roundOffsets, 3, {
        splitS: sp > 0 ? sp : 0, fade: pr(t, 7.4, 8.7), laneX: (i) => LANE(i).x + LI
      });
    }
  }

  // ---------- lanes (forks) ----------
  function laneDim(i, t) {
    let d = 0.38 + 0.62 * pr(t, EV.pickT[i], EV.pickT[i] + 0.6);
    d *= dimAfterPay(t);
    d *= 1 - pr(t, KILL[0], KILL[1]);
    // design review: during the conflict only the two agents involved and the card stay in focus
    if (i !== 0 && i !== CAUSER) d *= 1 - 0.65 * pr(t, EV.conflictT - 0.3, EV.conflictT + 0.2) * (1 - pr(t, EV.returnT[0] - 0.3, EV.returnT[0] + 0.2));
    return d;
  }
  const WALLET_T = (i) => 52.1 + 0.08 * i;
  const payIdx = (i) => EV.payees.indexOf(i);
  const coinArrival = (i, c) => EV.coinT0 + 0.12 * payIdx(i) + 0.22 * c + 0.95;
  const tokenFrac = (t) => 1 - pr(t, EV.tokenDrain[0], EV.tokenDrain[1]);
  const commitCount = (t) => { let n = 0; for (const row of EV.commits) for (const td of row) if (t >= td + 0.5) n++; return n; };

  function lanes(t) {
    if (t < 7.3 || t >= KILL[1]) return;
    const s = splitS(t);
    for (let i = 0; i < NA; i++) {
      const L = LANE(i), ag = A(i), n = TL.tasks[i];
      const r = lerpRect(SH, L, s);
      const a = pr(t, 7.5, 8.6) * laneDim(i, t);
      ctx.save(); ctx.globalAlpha *= a;
      panel(r, null, { fill: C.paper });
      const ca = pr(t, 8.9, 9.6);
      if (ca > 0) {
        ctx.save(); ctx.globalAlpha *= ca;
        // header: name + role (the agent shape itself is the alive object drawn in agentLayer)
        if (t < EV.pickT[i] + 0.6) T("fork", L.x + 80, L.y + 52, { size: 30, fill: C.muted });
        else { T(ag.name, L.x + 80, L.y + 52, { size: 30 }); T(ag.role, L.x + 80, L.y + 84, { size: 24, fill: C.muted, alpha: pr(t, EV.pickT[i] + 0.3, EV.pickT[i] + 0.7) }); }
        // fork starts as a copy of main: three sand bars
        for (let k = 0; k < 3; k++) bar(L.x + LI, by(k), BW, C.sand, { alpha: pr(t, 8.6, 9.4) });
        ctx.restore();
      }
      // token row
      const tt = EV.tokenT[i];
      if (t >= tt) {
        const ta = pr(t, tt, tt + 0.35);
        ctx.save(); ctx.globalAlpha *= ta;
        keyGlyph(L.x + 16, 383, C.orange);
        const f = tokenFrac(t);
        box(L.x + 76, 387, 64, 14, C.paper2, { lw: 2 });
        if (f > 0) box(L.x + 76, 387, 64 * f, 14, C.orange, { lw: 2 });
        if (t >= EV.expireT) { T("expired", L.x + 76, L.y + 148, { size: 24, fill: C.orangeDeep }); crossGlyph(L.x + 27, 394, 34, C.ink, 4); }
        else if (i === 0 && t < 27) T("write token", L.x + 16, L.y + 148, { size: 24, fill: C.muted });
        if (t >= WALLET_T(i)) {
          const wa = pr(t, WALLET_T(i), WALLET_T(i) + 0.4);
          const paid = payIdx(i) >= 0;
          const hit = paid ? pulse(t - coinArrival(i, 0)) : 0;
          ctx.globalAlpha *= wa;
          box(L.x + 160, 380, 76, 36, hit > 0 ? C.yellow : C.paper, { lw: 3 });
          if (paid || t < EV.clickT + 0.5) T("0x…", L.x + 168, 405, { size: 22 });
          else { crossGlyph(L.x + 198, 398, 20, C.ink, 4); }
        }
        ctx.restore();
      }
      // reverted lane: not paid
      if (i === REJ && t >= EV.clickT + 0.5) {
        const ra = pr(t, EV.clickT + 0.5, EV.clickT + 0.9);
        T("reverted, not paid", L.x + 12, L.y + 190, { size: 22, fill: C.ink, alpha: ra });
      }
      // task commits (one small bar per task) until lifted
      const lift = EV.lift[IDS[i]];
      if (t < lift) {
        for (let c = 0; c < n; c++) {
          const td = EV.commits[i][c];
          const al = clamp((t - td) / 0.1);
          if (al <= 0) continue;
          const y = lerp(L.y + 100, taskY(c), E.io(pr(t, td, td + 0.4)));
          sbar(L.x + LI, y, BW, ag.fill, al);
        }
        const rv = EV.inspVisit[i] + 0.55;
        if (t >= rv) badge(L.x + 222, blockTop(i) - 30, "ok", pr(t, rv, rv + 0.25));
      }
      ctx.restore();
    }
  }
  const walletHit = (i) => coinArrival(i, 0);

  // ---------- agent shapes: alive from the Hall to the leaderboard ----------
  const repY = (row) => 400 + row * 108;
  const initRow = [1, 3, 0, 2, 4];    // by reputation before: Forge, Vanta, Probe, Pixel, Rivet
  const finalRow = [0, 2, 4, 1, 3];   // after the review: Vanta, Probe, Pixel, Rivet, Forge (rejected, reputation takes the hit)
  function agentLayer(t) {
    if (t < EV.hallT || t >= KILL[1]) return;
    for (let i = 0; i < NA; i++) {
      const L = LANE(i), ag = A(i);
      const card = { x: L.x + 40, y: 500, u: 12 };
      const head = { x: L.x + 40, y: 325, u: 16 };
      const lb = { x: 150, y: repY(initRow[i]), u: 20 };
      const lb2 = { x: 150, y: repY(finalRow[i]), u: 20 };
      const swapS = pr(t, EV.swapT[0], EV.swapT[1], E.io);
      const lbp = { x: lb.x, y: lerp(lb.y, lb2.y, swapS), u: lb.u };
      const aIn = pr(t, EV.hallT + 0.12 * i, EV.hallT + 0.12 * i + 0.4);
      const pk = pr(t, EV.pickT[i], EV.pickT[i] + 0.8, E.io);
      const toLb = pr(t, 56.2 + 0.08 * i, 57.0 + 0.08 * i, E.io);
      let p = { x: lerp(card.x, head.x, pk), y: lerp(card.y, head.y, pk), u: lerp(card.u, head.u, pk) };
      p = { x: lerp(p.x, lbp.x, toLb), y: lerp(p.y, lbp.y, toLb), u: lerp(p.u, lbp.u, toLb) };
      let bump = 0;
      for (const td of EV.commits[i]) bump = Math.max(bump, pulse(t - td - 0.4));
      bump = Math.max(bump, pulse(t - EV.pickT[i] - 0.8));
      if (i === CAUSER) bump = Math.max(bump, pulse(t - EV.resolveT));
      const al = aIn * (1 - pr(t, KILL[0], KILL[1] - 0.1));
      shapeC(ag.shape, p.x, p.y, p.u * (1 + 0.1 * bump), ag.fill, al);
    }
  }

  // ---------- S3: goal, Foreman, leases ----------
  function sceneS3(t) {
    if (t < 13 || t >= 26.2) return;
    const FOR = { x: 1656, y: 470 };
    // human
    const ha = win(t, 13.2, 19.3, 0.4, 0.5);
    if (ha > 0) {
      const hx = lerp(150, 252, E.out(pr(t, 13.2, 14.0)));
      ctx.save(); ctx.globalAlpha *= ha;
      const approved = t >= EV.approvePlanT;
      ctx.beginPath(); ctx.arc(hx, 475, 30, 0, Math.PI * 2);
      ctx.fillStyle = approved ? C.ink : C.paper; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
      if (approved) checkGlyph(hx, 475, 30, C.paper, 5);
      T(approved ? "you approve" : "you", hx, 540, { size: 28, align: "center", fill: C.ink });
      ctx.restore();
    }
    // goal card
    const ca = win(t, EV.goalT, 17.0, 0.4, 0.8);
    if (ca > 0) {
      const dx = (1 - E.out(pr(t, EV.goalT, EV.goalT + 0.8))) * -50;
      ctx.save(); ctx.globalAlpha *= ca; ctx.translate(dx, 0);
      box(340, 360, 640, 230, C.paper, { lw: 3 });
      T("GOAL", 364, 402, { size: 26, fill: C.muted });
      T("A themed shop with", 364, 462, { font: TY.serif, size: 46, weight: 600 });
      T("search, cart and docs", 364, 518, { font: TY.serif, size: 46, weight: 600 });
      T("BUDGET", 364, 566, { size: 26, fill: C.muted });
      box(520, 548, 300, 20, C.orange, { lw: 3 });
      ctx.restore();
    }
    // Foreman reads the card
    const fa = win(t, 15.3, 26.0, 0.4, 0.4);
    if (fa > 0) {
      const mv = pr(t, 25.0, 25.9, E.io);
      const fx = lerp(FOR.x, MAIN.x + MAIN.w - 66, mv), fy = lerp(FOR.y, 322, mv), u = lerp(30, 14, mv);
      ctx.save(); ctx.globalAlpha *= fa;
      shapeC("I", fx, fy, u, C.orangeDeep, 1);
      if (mv < 0.5) T("Foreman", FOR.x, FOR.y + 60, { size: 34, align: "center", alpha: 1 - mv * 2 });
      ctx.restore();
      const la = win(t, 15.5, 17.2, 0.3, 0.5);
      if (la > 0) {
        ctx.save(); ctx.globalAlpha *= la; ctx.setLineDash([12, 8]); ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
        ctx.beginPath(); ctx.moveTo(990, 475); ctx.lineTo(lerp(990, 1590, pr(t, 15.5, 16.2, E.io)), 475); ctx.stroke(); ctx.restore();
      }
    }
    // lease chips: leave the card, settle at the foot of each lane, and stay until the merge
    for (let i = 0; i < NA; i++) {
      const L = LANE(i), ag = A(i);
      const t0 = EV.chipT + 0.1 * i, t1 = t0 + 1.3;
      const s = pr(t, t0, t1, E.io);
      const a = pr(t, t0 - 0.05, t0 + 0.25);
      if (a <= 0) continue;
      const x = lerp(380 + i * 120, L.x + LI, s), y = lerp(600, 806, s);
      ctx.save(); ctx.globalAlpha *= a;
      box(x, y, BW, 54, C.paper, { lw: 3 });
      T(ag.file, x + 12, y + 35, { size: 24 });
      T("lease", x, y - 8, { size: 26, fill: C.muted, alpha: s });
      ctx.restore();
    }
  }
  // chips live past S3: draw them from the same function until the turn
  function leaseChipsLate(t) {
    if (t < 26.2 || t >= KILL[1]) return;
    for (let i = 0; i < NA; i++) {
      const L = LANE(i), ag = A(i);
      const a = (1 - pr(t, KILL[0], KILL[1])) * dimAfterPay(t);
      const rel = pr(t, EV.leaseRelT[0], EV.leaseRelT[1]);          // lease releases once the delivery is merged
      ctx.save(); ctx.globalAlpha *= a * (1 - 0.6 * rel);
      box(L.x + LI, 806, BW, 54, C.paper, { lw: 3, dash: rel > 0.5 ? [8, 6] : null });
      T(ag.file, L.x + LI + 12, 841, { size: 24 });
      T(rel > 0.5 ? "released" : "lease", L.x + LI, 798, { size: 26, fill: C.muted });
      ctx.restore();
    }
  }

  // ---------- S4: the Hall ----------
  function sceneS4(t) {
    if (t < EV.hallT || t >= 23.2) return;
    const lab = win(t, EV.hallT, 22.6, 0.3, 0.5);
    T("THE HALL", LANE(0).x + 20, 450, { size: 28, fill: C.muted, alpha: lab });
    for (let i = 0; i < NA; i++) {
      const L = LANE(i), ag = A(i);
      const t0 = EV.hallT + 0.12 * i;
      const a = pr(t, t0, t0 + 0.4) * (1 - pr(t, EV.pickT[i] + 0.3, EV.pickT[i] + 0.9));
      if (a <= 0) continue;
      const dy = (1 - E.out(pr(t, t0, t0 + 0.6))) * 26;
      const hire = pr(t, EV.pickT[i] - 0.2, EV.pickT[i] + 0.1);
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, dy);
      box(L.x + 8, 462, 240, 178, C.paper, { lw: hire > 0.5 ? 5 : 3, sc: hire > 0.5 ? C.orangeDeep : C.ink });
      T(ag.name, L.x + 74, 506, { size: 34 });
      T(ag.role, L.x + 24, 548, { size: 28 });
      T(ag.tier, L.x + 24, 576, { size: 22, fill: C.muted });
      T("track record", L.x + 24, 604, { size: 20, fill: C.muted });
      box(L.x + 24, 612, 208, 16, C.paper2, { lw: 2 });
      box(L.x + 24, 612, 208 * ag.rep0 * pr(t, t0 + 0.3, t0 + 1.0, E.out), 16, C.orange, { lw: 2 });
      ctx.restore();
    }
  }

  // ---------- S5: stamp for the one measured number (count-up as the task commits land) ----------
  function sceneS5(t) {
    const a = win(t, EV.stampT[0], EV.stampT[1], 0.4, 0.5);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    box(MAIN.x + 16, 436, MAIN.w - 32, 196, C.paper, { lw: 3 });
    T("LIVE RUN", MAIN.x + 34, 476, { size: 26, fill: C.muted });
    T(String(commitCount(t)), MAIN.x + 34, 556, { font: TY.serif, weight: 600, size: 84 });
    T(`task commits, ${CREW.agents} agents`, MAIN.x + 34, 596, { size: 20, fill: C.muted });
    T(CREW.date, MAIN.x + 34, 620, { size: 20, fill: C.muted });
    ctx.restore();
  }

  // ---------- S6: Inspector (house service) ----------
  function sceneS6(t) {
    if (t < 33.2 || t >= 36.5) return;
    const a = win(t, 33.4, 36.3, 0.3, 0.3);
    const v = EV.inspVisit;
    let x = LANE(0).x + 128;
    for (let i = 1; i < NA; i++) x = lerp(x, LANE(i).x + 128, pr(t, v[i] - 0.4, v[i] - 0.1, E.io));
    ctx.save(); ctx.globalAlpha *= a;
    shapeC("R", x, 462, 12, C.paper, 1);
    T("Inspector", x + 28, 470, { size: 22, fill: C.ink, alpha: 1 });
    ctx.restore();
    for (let i = 0; i < NA; i++) {
      const L = LANE(i);
      const ba = pr(t, v[i] - 0.1, v[i] + 0.2) * (1 - pr(t, v[i] + 0.4, v[i] + 0.8)) * a;
      if (ba > 0) {
        ctx.save(); ctx.globalAlpha *= ba;
        box(L.x + 10, blockTop(i) - 10, 236, 631 - blockTop(i) + 18, null, { lw: 4, dash: [14, 8] });
        ctx.restore();
      }
    }
  }

  // ---------- S7: merge queue, conflict as data, the cause resolves it ----------
  const LEG = (i) => LANE(i).x + LI;
  const MX = MAIN.x + 28, MBW = MAIN.w - 56;
  const K0 = { vanta: 3, forge: 4, probe: 5, rivet: 6, pixel: 7 };
  const QUEUE = ["vanta", "forge", "probe", "rivet", "pixel"];
  const kOf = (id, t) => (t >= RV.revertT[1] && K0[id] > K0.forge ? K0[id] - 1 : K0[id]);   // Forge's bar is gone after the revert
  function packetPoint(id, t) {
    // returns {x,y,state} for the delivery bar of agent `id`, null before lift. State: 'queue','conflict','back','fresh','final'.
    const i = IDS.indexOf(id), lift = EV.lift[id];
    if (t < lift) return null;
    const xs = LEG(i), yTop = 450, yStart = pk0(i), yEnd = by(kOf(id, t));
    if (id !== EV.causer) {
      const u = t - lift;
      const l1 = pr(u, 0, 0.45, E.io), l2 = pr(u, 0.45, 1.35, E.io), l3 = pr(u, 1.35, 1.8, E.io);
      const y = u < 0.45 ? lerp(yStart, yTop, l1) : u < 1.35 ? yTop : lerp(yTop, yEnd, l3);
      const x = u < 0.45 ? xs : u < 1.35 ? lerp(xs, MX, l2) : MX;
      return { x, y, landed: u >= 1.8 };
    }
    const yH = by(K0[id]) - 30;                     // hover point above the stack
    if (t < EV.conflictT) {
      const u = t - lift;
      const l1 = pr(u, 0, 0.45, E.io), l2 = pr(u, 0.45, 1.35, E.io), l3 = pr(u, 1.35, 1.8, E.io);
      const y = u < 0.45 ? lerp(yStart, yTop, l1) : u < 1.35 ? yTop : lerp(yTop, yH, l3);
      const x = u < 0.45 ? xs : u < 1.35 ? lerp(xs, MX, l2) : MX;
      return { x, y, state: "queue" };
    }
    if (t < EV.returnT[0]) return { x: MX, y: yH, state: "conflict" };
    if (t < EV.returnT[1]) {
      const u = t - EV.returnT[0], d = EV.returnT[1] - EV.returnT[0];
      const a = pr(u, 0, d * 0.3, E.io), b = pr(u, d * 0.3, d, E.io);
      return { x: lerp(MX, xs, b), y: lerp(yH, yTop, a), state: "back" };
    }
    if (t < EV.relandT[0]) return { x: xs, y: yTop, state: "fresh" };
    const u = t - EV.relandT[0], d = EV.relandT[1] - EV.relandT[0];
    const a = pr(u, 0, d * 0.7, E.io), b = pr(u, d * 0.7, d, E.io);
    return { x: lerp(xs, MX, a), y: lerp(yTop, yEnd, b), state: "final", landed: t >= EV.relandT[1] };
  }
  function deliveries(t) {
    if (t < EV.lift.vanta - 0.1 || t >= KILL[1]) return;
    const fade = dimAfterPay(t) * (1 - pr(t, KILL[0], KILL[1]));
    ctx.save(); ctx.globalAlpha *= fade;
    // conveyor guide
    const ga = win(t, EV.lift.vanta - 0.1, 44.0, 0.3, 0.5);
    if (ga > 0) {
      ctx.save(); ctx.globalAlpha *= ga * 0.8; ctx.setLineDash([4, 10]); ctx.lineWidth = 3; ctx.strokeStyle = C.line;
      ctx.beginPath(); ctx.moveTo(110, 450 + 17); ctx.lineTo(MX + MBW / 2, 450 + 17); ctx.stroke(); ctx.restore();
      T("merge queue", 110, 442, { size: 24, fill: C.muted, alpha: ga });
    }
    for (const id of QUEUE) {
      if (id === "forge" && t >= RV.revertT[1]) continue;       // reverted on main
      const p = packetPoint(id, t);
      if (!p) continue;
      const i = IDS.indexOf(id), ag = A(i), lift = EV.lift[id], n = TL.tasks[i];
      const u = t - lift;
      const col0 = pr(u, 0, 0.3, E.io);                                   // the task commits collapse into one delivery
      const col = id === EV.causer && t >= EV.returnT[0] ? 1 : col0;
      const w = lerp(BW, MBW, p.x > LEG(i) + 1 || p.landed ? pr(p.x, LEG(i), MX) : 0);
      if (col < 1) {
        for (let c = n - 1; c >= 0; c--) {
          const y = lerp(taskY(c), p.y + 10.5, col);
          sbar(p.x, y, w, ag.fill, 1);
        }
      }
      if (col > 0.55) { ctx.save(); ctx.globalAlpha *= pr(col, 0.55, 1); bar(p.x, p.y, w, ag.fill, { label: ag.name }); ctx.restore(); }
      if (id === EV.causer) {
        if (p.state === "conflict") {
          hatch(p.x, p.y, w, 34, 0.85);
          box(p.x - 6, p.y - 6, w + 12, 46, null, { lw: 4, dash: [10, 6] });
          const sy = by(K0.vanta);
          box(MX - 6, sy - 6, MBW + 12, 46, null, { lw: 4, dash: [10, 6], alpha: pr(t, EV.conflictT, EV.conflictT + 0.3) });
          badge(MX - 26 + MBW + 28 + 0, p.y - 26, "x", pr(t, EV.conflictT, EV.conflictT + 0.3));
        }
        if ((p.state === "fresh" || p.state === "back") && t < EV.resolveT + 0.6) {
          // "fresh main": a tiny marker while the cause re-delivers
          T("fresh main", p.x + 4, p.y - 12, { size: 22, fill: C.orangeDeep, alpha: pr(t, EV.returnT[1] - 0.2, EV.returnT[1] + 0.2) });
        }
        if (p.landed) badge(MX + MBW + 20, p.y + 17, "ok", pr(t, EV.relandT[1], EV.relandT[1] + 0.3));
      }
    }
    ctx.restore();
  }
  function conflictCard(t) {
    const a0 = EV.cardT[0], a1 = EV.cardT[1];
    if (t < a0 || t >= a1 + 0.9) return;
    const a = win(t, a0, a1 + 0.9, 0.25, 0.7);
    const sh = pr(t, a1, a1 + 0.9, E.io);           // card flies back toward the cause's lane as it resolves
    const x = lerp(560, LANE(CAUSER).x + 40, sh), y = lerp(440, 330, sh), sc = lerp(1, 0.35, sh);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(sc, sc);
    box(0, 0, 790, 380, C.paper, { lw: 4 });
    box(0, 0, 200, 52, C.ink, { lw: 3 });
    crossGlyph(26, 26, 18, C.paper, 4);
    T("CONFLICT", 50, 36, { size: 28, fill: C.paper });
    T("what the merge returns:", 222, 36, { size: 24, fill: C.muted });
    const lines = [
      "{",
      '  "path":   "index.html",',
      '  "base":   ["<header>"],',
      '  "ours":   ["<header class=\'hero\'>"],',
      '  "theirs": ["<header class=\'pills\'>"]',
      "}"
    ];
    let seen = 0;
    const nChars = Math.floor((t - a0 - 0.1) * 105);
    lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, nChars - seen));
      seen += ln.length + 1;
      T(part, 24, 102 + i * 40, { size: 31, fill: i === 0 || i === 5 ? C.muted : C.ink });
    });
    T("<<<<<<< HEAD", 24, 352, { size: 26, fill: C.muted, alpha: pr(t, a0 + 0.9, a0 + 1.2) });
    const sa = pr(t, a0 + 0.9, a0 + 1.2);
    if (sa > 0) { ctx.save(); ctx.globalAlpha *= sa; ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(20, 343); ctx.lineTo(24 + 12 * 15.6, 343); ctx.stroke(); ctx.restore(); }
    T("not this", 24 + 12 * 15.6 + 24, 352, { size: 22, fill: C.muted, alpha: sa });
    ctx.restore();
  }

  // ---------- S8: the human visual review. One chapter per hire; a lens reveals the new site over the old ----------
  const FR = { x: 96, y: 362, w: 1040, h: 480 };                      // the site preview (browser frame)
  const RAIL = { x: 1176, y: 362, w: 648, rowH: 80, pitch: 92 };
  const LENS_R = [124, 124, 100, 104, 104];   // per chapter, so the ring never runs into the toolbar or the stage edge
  // where each chapter's change lives on the site, in frame coordinates (x, y)
  const TARGET = [[272, 172], [780, 238], [858, 428], [910, 82], [190, 82]];
  const targetAbs = (k) => [FR.x + TARGET[k][0], FR.y + TARGET[k][1]];
  const LENS_START = [FR.x + 90, FR.y + 400];
  function drawSite(f) {                                               // f[k]: chapter k's change is present
    ctx.save();
    ctx.translate(FR.x, FR.y);
    box(0, 0, FR.w, FR.h, C.paper, { lw: 3 });
    box(0, 0, FR.w, 44, C.paper2, { lw: 3 });
    for (let k = 0; k < 3; k++) box(18 + k * 26, 15, 14, 14, C.paper, { lw: 2.5 });
    box(110, 8, 560, 28, C.paper, { lw: 2.5 });
    T("preview · ballast/type-site", 126, 29, { size: 20, fill: C.muted });
    ctx.translate(32, 62);
    // nav
    box(0, 6, 70, 28, C.ink, { lw: 2 });
    if (f[4]) {                                                        // Platform: security headers chip with a padlock
      box(96, 4, 190, 32, C.paper, { lw: 3 });
      ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(110, 16); ctx.lineTo(110, 11); ctx.lineTo(120, 11); ctx.lineTo(120, 16); ctx.stroke(); ctx.restore();
      box(106, 16, 18, 14, C.ink, { lw: 2 });
      T("headers", 134, 28, { size: 20 });
    }
    for (let k = 0; k < 4; k++) box(400 + k * 92, 14, 76, 12, C.sand, { lw: 2 });
    if (f[3]) {                                                        // QA: tests-passing chip
      box(780, 4, 196, 32, C.paper, { lw: 3 });
      checkGlyph(804, 20, 18, C.ink, 4);
      T("tests pass", 826, 28, { size: 20 });
    }
    // hero text
    if (!f[0]) {
      box(0, 80, 360, 18, C.sand, { lw: 2 }); box(0, 108, 250, 18, C.sand, { lw: 2 });
      box(0, 150, 400, 10, C.line, { lw: 2, sc: C.line }); box(0, 170, 320, 10, C.line, { lw: 2, sc: C.line });
      box(0, 212, 140, 40, C.paper, { lw: 3 });
    } else {                                                           // Front-end: type scale, spacing, orange rule
      box(0, 70, 480, 34, C.ink, { lw: 2 }); box(0, 114, 350, 34, C.ink, { lw: 2 });
      box(0, 162, 120, 10, C.orange, { lw: 2 });
      box(0, 192, 400, 10, C.line, { lw: 2, sc: C.line }); box(0, 212, 320, 10, C.line, { lw: 2, sc: C.line });
      box(0, 250, 140, 40, C.orange, { lw: 3 });
    }
    // hero art panel
    box(520, 56, 456, 236, C.paper2, { lw: 3 });
    if (!f[1]) { box(560, 120, 160, 100, C.sand, { lw: 2 }); box(740, 150, 190, 70, C.sand, { lw: 2 }); }
    else {                                                             // Motion: motto pills, scattered
      const pills = [[552, 92, 150, -0.12, C.orange], [740, 80, 190, 0.08, C.yellow], [560, 160, 210, 0.1, C.paper], [800, 170, 150, -0.1, C.orange], [620, 230, 190, -0.06, C.yellow], [800, 236, 140, 0.12, C.paper]];
      for (const [px, py, pw, rot, fl] of pills) {
        ctx.save(); ctx.translate(px + pw / 2, py + 17); ctx.rotate(rot);
        box(-pw / 2, -17, pw, 34, fl, { lw: 3 }); box(-pw / 2 + 12, -3, pw - 24, 8, C.ink, { lw: 1 });
        ctx.restore();
      }
    }
    // cards
    for (let k = 0; k < 3; k++) {
      const cx = k * 338;
      if (k === 2 && f[2]) {                                           // Back-end: contact form wired to the API
        box(cx, 322, 300, 92, C.paper, { lw: 3 });
        box(cx + 14, 334, 150, 18, C.paper, { lw: 2 }); box(cx + 14, 360, 150, 18, C.paper, { lw: 2 });
        box(cx + 14, 386, 90, 20, C.orange, { lw: 3 });
        box(cx + 180, 334, 104, 72, C.paper2, { lw: 2 }); T("POST", cx + 196, 378, { size: 20 });
      } else {
        box(cx, 322, 300, 92, C.paper, { lw: 3 });
        if (f[0]) box(cx, 322, 300, 8, C.orange, { lw: 3 });
        box(cx + 16, 346, 180, 14, C.sand, { lw: 2 }); box(cx + 16, 372, 240, 10, C.line, { lw: 2, sc: C.line });
      }
    }
    ctx.restore();
  }
  function lensState(t) {                                              // which chapter is active, lens position and radius
    let k = -1;
    for (let c = 0; c < RV.chStart.length; c++) if (t >= RV.chStart[c]) k = c;
    if (k < 0) return null;
    const from = k === 0 ? LENS_START : targetAbs(k - 1), to = targetAbs(k);
    const m = pr(t, RV.chStart[k], RV.chStart[k] + RV.moveDur[k], E.io);
    const pos = [lerp(from[0], to[0], m), lerp(from[1], to[1], m)];
    let alpha = pr(t, RV.chStart[k], RV.chStart[k] + 0.2) * (approvedLane(k) ? 1 - pr(t, RV.verdictT[k] + 0.1, RV.verdictT[k] + 0.4) : 1 - pr(t, RV.revertT[1] - 0.05, RV.revertT[1] + 0.15));
    let r = LENS_R[k] * (approvedLane(k) ? 1 : 1 - E.io(pr(t, RV.revertT[0], RV.revertT[1])));
    return { k, pos, alpha, r, m };
  }
  function sceneReview(t) {
    const a = pr(t, RV.in[0], RV.in[1]) * (1 - pr(t, RV.out[0], RV.out[1]));
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = C.paper; ctx.fillRect(0, 262, W, 636);
    // toolbars: compare modes (Lens is on), chapter/timeline switch, the human
    const seg = (x, y, w, label, on) => { box(x, y, w, 38, on ? C.ink : C.paper, { lw: 3 }); T(label, x + w / 2, y + 27, { size: 22, align: "center", fill: on ? C.paper : C.ink }); };
    seg(FR.x, 296, 96, "Lens", true); seg(FR.x + 96, 296, 112, "Blend", false); seg(FR.x + 208, 296, 112, "X-ray", false);
    seg(RAIL.x, 296, 156, "Chapters", true); seg(RAIL.x + 156, 296, 156, "Timeline", false);
    ctx.beginPath(); ctx.arc(1768, 315, 17, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
    T("you", 1796, 324, { size: 22, fill: C.muted });
    // the site: old, with every approved change applied; the lens shows the new one
    const applied = [0, 1, 2, 3, 4].map((k) => approvedLane(k) && t >= RV.verdictT[k]);
    drawSite(applied);
    const L = lensState(t);
    if (L && L.alpha > 0 && L.r > 8) {
      const f2 = applied.slice(); f2[L.k] = true;
      ctx.save(); ctx.globalAlpha *= L.alpha;
      ctx.beginPath(); ctx.rect(FR.x, FR.y, FR.w, FR.h); ctx.clip();
      ctx.beginPath(); ctx.arc(L.pos[0], L.pos[1], L.r, 0, Math.PI * 2); ctx.clip();
      drawSite(f2);
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= L.alpha;
      ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(L.pos[0], L.pos[1], L.r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = C.orange; ctx.beginPath(); ctx.arc(L.pos[0], L.pos[1], Math.max(0, L.r - 6), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    T("inside the ring: after this hire", FR.x, 872, { size: 24, fill: C.muted });
    // the chapter rail
    for (let i = 0; i < NA; i++) {
      const ag = A(i), y = RAIL.y + i * RAIL.pitch, x = RAIL.x;
      const started = t >= RV.chStart[i], decided = t >= RV.verdictT[i];
      const active = started && !decided;
      const cur = L && L.k === i;
      box(x, y, RAIL.w, RAIL.rowH, cur ? C.paper2 : C.paper, { lw: cur ? 5 : 3 });
      shapeC(ag.shape, x + 44, y + 40, 12, ag.fill, 1);
      T(ag.role, x + 92, y + 36, { size: 30 });
      T(ag.name, x + 92, y + 66, { size: 22, fill: C.muted });
      const rej = !approvedLane(i);
      if (decided) {
        badge(x + 410, y + 40, rej ? "x" : "ok", pr(t, RV.verdictT[i], RV.verdictT[i] + 0.2));
        T(rej ? "rejected" : "approved", x + 440, y + 50, { size: 28, alpha: pr(t, RV.verdictT[i], RV.verdictT[i] + 0.2) });
        if (t >= RV.verdictT[i] && t < RV.verdictT[i] + 0.2) box(x + 4, y + 4, RAIL.w - 8, RAIL.rowH - 8, null, { lw: 3, alpha: 1 - (t - RV.verdictT[i]) / 0.2 });
      } else if (active) {
        const press = t >= RV.verdictT[i] - 0.12;
        const pa = press && !rej, pr2 = press && rej;
        box(x + 372, y + 22, 132, 38, pa ? C.ink : C.paper, { lw: 3 }); T("Approve", x + 438, y + 49, { size: 22, align: "center", fill: pa ? C.paper : C.ink });
        box(x + 516, y + 22, 112, 38, pr2 ? C.ink : C.paper, { lw: 3 }); T("Reject", x + 572, y + 49, { size: 22, align: "center", fill: pr2 ? C.paper : C.ink });
      } else if (!started) {
        T("waiting", x + 440, y + 50, { size: 22, fill: C.muted });
      }
    }
    // the human's cursor drags the lens, then clicks Approve or Reject
    if (L) {
      const k = L.k;
      const btn = approvedLane(k) ? [RAIL.x + 438, RAIL.y + k * RAIL.pitch + 41] : [RAIL.x + 572, RAIL.y + k * RAIL.pitch + 41];
      const ct = pr(t, RV.verdictT[k] - 0.4, RV.verdictT[k] - 0.05, E.io);
      const cx = lerp(L.pos[0] + 18, btn[0] + 12, ct), cy = lerp(L.pos[1] + 18, btn[1] + 8, ct);
      const ca = pr(t, RV.chStart[k], RV.chStart[k] + 0.2) * (1 - pr(t, RV.verdictT[k] + 0.15, RV.verdictT[k] + 0.4));
      if (ca > 0) cursor(cx, cy, ca);
    }
    // the rule
    const na = pr(t, RV.rejectNoteT, RV.rejectNoteT + 0.4);
    if (na > 0) {
      ctx.save(); ctx.globalAlpha *= na;
      crossGlyph(RAIL.x + 18, 855, 20, C.ink, 4);
      T(`${A(REJ).name}: reverted on main, not paid`, RAIL.x + 44, 864, { size: 24 });
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- S9: approve & pay, tokens expire ----------
  function sceneS8(t) {
    if (t < 52 || t >= KILL[1]) return;
    const fade = (1 - pr(t, KILL[0], KILL[1])) * dimAfterPay(t);
    ctx.save(); ctx.globalAlpha *= fade;
    // button
    const ba = pr(t, 52.1, 52.5);
    const click = t >= EV.clickT;
    if (ba > 0) {
      ctx.save(); ctx.globalAlpha *= ba;
      const bx = MAIN.x + 28, byy = 790, bw = MAIN.w - 56, bh = 60;
      const pressed = click && t < EV.clickT + 0.18;
      const s = pressed ? 0.97 : 1;
      ctx.translate(bx + bw / 2, byy + bh / 2); ctx.scale(s, s); ctx.translate(-bw / 2, -bh / 2);
      box(0, 0, bw, bh, click ? C.orange : C.ink, { lw: 3 });
      if (click) { checkGlyph(36, 30, 26, C.ink, 5); T("Paid", 68, 40, { size: 28, fill: C.ink }); }
      else T("Approve & pay", bw / 2, 40, { size: 28, fill: C.paper, align: "center" });
      ctx.restore();
    }
    // x402 chip
    const xa = win(t, 53.4, 55.9, 0.3, 0.4);
    if (xa > 0) { ctx.save(); ctx.globalAlpha *= xa; box(MAIN.x + 16, 345, MAIN.w - 32, 46, C.paper, { lw: 3 }); T("x402 · test USDC", MAIN.x + 32, 377, { size: 26 }); ctx.restore(); }
    // coins: only to the approved hires
    for (let pi = 0; pi < EV.payees.length; pi++) for (let c = 0; c < 3; c++) {
      const i = EV.payees[pi];
      const t0 = EV.coinT0 + 0.12 * pi + 0.22 * c, t1 = t0 + 0.95;
      if (t < t0 || t > t1) continue;
      const s = E.io(pr(t, t0, t1));
      const p0 = { x: MAIN.x + MAIN.w / 2, y: 770 }, p2 = { x: LANE(i).x + 198, y: 398 }, p1 = { x: (p0.x + p2.x) / 2, y: 330 };
      const x = (1 - s) * (1 - s) * p0.x + 2 * (1 - s) * s * p1.x + s * s * p2.x;
      const y = (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * p1.y + s * s * p2.y;
      box(x - 11, y - 11, 22, 22, C.orange, { lw: 3 });
    }
    // cursor
    if (t >= EV.cursorT[0] - 0.3 && t < 53.8) {
      const k = pr(t, EV.cursorT[0], EV.cursorT[1], E.io);
      const cx = lerp(1330, MAIN.x + 28 + (MAIN.w - 56) / 2 + 10, k), cy = lerp(660, 810, k);
      cursor(cx, cy, win(t, EV.cursorT[0] - 0.3, 53.8, 0.3, 0.4));
    }
    ctx.restore();
  }

  // ---------- S10: reputation comes from git ----------
  function sceneS9(t) {
    const a = win(t, 56.1, 59.5, 0.4, 0.4);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    box(92, 281, 1742, 593, C.paper2, { lw: 3 });
    T("THE HALL", 126, 335, { size: 30, fill: C.muted });
    T("reputation, from what git recorded (illustrative)", 366, 335, { size: 26, fill: C.muted });
    const swapS = pr(t, EV.swapT[0], EV.swapT[1], E.io);
    const tags = [["merged clean", "ok"], ["caused a conflict", "x"], ["rejected, reverted", "x"], ["merged clean", "ok"], ["merged clean", "ok"]];
    for (let i = 0; i < NA; i++) {
      const ag = A(i);
      const y = lerp(repY(initRow[i]), repY(finalRow[i]), swapS);
      T(ag.name, 226, y + 14, { size: 36 });
      const grow = pr(t, EV.repT[0] + 0.12 * i, EV.repT[1] + 0.12 * i, E.io);
      const f0 = ag.rep0, f1 = ag.rep1;
      const f = lerp(f0, f1, grow);
      const bx = 460, bw = 760;
      box(bx, y - 18, bw, 36, C.paper, { lw: 3 });
      box(bx, y - 18, bw * f, 36, C.orange, { lw: 3 });
      // the part earned or lost this job gets an ink tick so the change is visible without colour
      if (grow > 0 && f1 !== f0) box(bx + bw * f0 - 2, y - 24, 4, 48, C.ink, { lw: 1 });
      const tg = pr(t, 56.9 + 0.15 * i, 57.3 + 0.15 * i);
      if (tg > 0) {
        ctx.save(); ctx.globalAlpha *= tg;
        badge(1290, y, tags[i][1], 1);
        T(tags[i][0], 1326, y + 11, { size: 30 });
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------- S11: change one variable, then the reframe ----------
  function sceneS10(t) {
    if (t < 59.6 || t >= 67.5) return;
    const TD = EV.turnDrops, G = EV.turnGap;
    const a1 = win(t, 59.7, 63.2, 0.4, 0.4);
    if (a1 > 0) {
      const LPN = { x: 96, y: 285, w: 804, h: 585 }, RP = { x: 1020, y: 285, w: 804, h: 585 };
      ctx.save(); ctx.globalAlpha *= a1;
      panel(LPN, "Shared repo");
      T("token never expires", LPN.x + 22, LPN.y + 92, { size: 26, fill: C.muted });
      panel(RP, "Repo per agent");
      T("token expires with the contract", RP.x + 22, RP.y + 92, { size: 26, fill: C.muted });
      const lb = barBox(LPN);
      for (let k = 0; k < 3; k++) bar(lb.x, by(k), lb.w, C.sand);
      chaos(t, LPN, [TD, TD + G, TD + 2 * G], EV.roundOffsets, 3, { spread: 1, startY: LPN.y + 150 });
      const mr = { x: RP.x + 252, w: 300 };
      for (let k = 0; k < 3; k++) bar(mr.x, by(k), mr.w, C.sand);
      // four guides, simultaneous drops, then merged one at a time
      for (let j = 0; j < 4; j++) {
        const gx = RP.x + 28 + j * 192;
        ctx.save(); ctx.setLineDash([8, 8]); ctx.lineWidth = 2.5; ctx.strokeStyle = C.line; ctx.globalAlpha *= 0.9;
        ctx.beginPath(); ctx.moveTo(gx + 75, RP.y + 130); ctx.lineTo(gx + 75, 460); ctx.stroke(); ctx.restore();
        const ag = A(j);
        const drop = pr(t, TD, TD + 0.5, E.io), al = clamp((t - TD) / 0.12);
        const tm = TD + 0.5 + 0.4 * j, merge = pr(t, tm, tm + 0.45, E.io);
        const px = lerp(gx, mr.x, merge), py = lerp(lerp(RP.y + 130, 430, drop), by(3 + j), merge);
        if (al > 0) bar(px, py, lerp(150, 300, merge), ag.fill, { alpha: al });
      }
      const okT = TD + 0.5 + 0.4 * 3 + 0.5;
      const pa = pr(t, TD + 1.95, TD + 2.25), ca = pr(t, okT, okT + 0.3);
      if (pa > 0) { ctx.save(); ctx.globalAlpha *= pa; badge(LPN.x + 40, LPN.y + LPN.h - 44, "x"); T("pile-up", LPN.x + 76, LPN.y + LPN.h - 32, { size: 30 }); ctx.restore(); }
      if (ca > 0) { ctx.save(); ctx.globalAlpha *= ca; badge(RP.x + 40, RP.y + RP.h - 44, "ok"); T("clean merge", RP.x + 76, RP.y + RP.h - 32, { size: 30 }); ctx.restore(); }
      ctx.restore();
    }
    // reframe: three words change meaning (git -> Forkyard)
    const rows = [["Pull request", "Contract"], ["Branch", "Hire"], ["Commit history", "Résumé"]];
    const a2 = win(t, 63.1, 67.4, 0.3, 0.35);
    if (a2 > 0) {
      ctx.save(); ctx.globalAlpha *= a2;
      T("git", 96, 318, { size: 28, fill: C.muted });
      T("Forkyard", 940, 318, { size: 28, fill: C.orangeDeep });
      rows.forEach(([from, to], i) => {
        const y = 440 + i * 150;
        const rv = pr(t, EV.reframeT[i], EV.reframeT[i] + 0.8, E.io);
        T(from, 96, y, { font: TY.serif, weight: 500, size: 92, fill: C.muted, alpha: 1 - 0.35 * rv });
        // strike line on the old word, so the change reads without colour
        ctx.save(); ctx.strokeStyle = C.muted; ctx.lineWidth = 4; ctx.globalAlpha *= rv;
        ctx.font = `500 92px ${TY.serif}`; const fw = ctx.measureText(from).width;
        ctx.beginPath(); ctx.moveTo(96, y - 30); ctx.lineTo(96 + fw * rv, y - 30); ctx.stroke(); ctx.restore();
        T("→", 840, y - 6, { size: 60, fill: C.orangeDeep, alpha: rv });
        ctx.save(); ctx.beginPath(); ctx.rect(940, y - 100, 880 * rv, 140); ctx.clip();
        T(to, 940, y, { font: TY.serif, weight: 600, size: 100, fill: C.ink });
        ctx.restore();
        ctx.font = `600 100px ${TY.serif}`; const tw = ctx.measureText(to).width;
        box(940, y + 22, tw * rv, 16, C.orange, { lw: 3 });
      });
      ctx.restore();
    }
  }

  // ---------- S12: the opening image, read correctly ----------
  function sceneS11(t) {
    if (t < 67.3) return;
    const a = pr(t, 67.3, 67.9);
    ctx.save(); ctx.globalAlpha *= a;
    panel(SH, "main");
    T("every cell has an owner", SH.x + 150, SH.y + 50, { size: 24, fill: C.muted, alpha: pr(t, 70.6, 71.2) });
    const bb = barBox(SH);
    for (let k = 0; k < 3; k++) bar(bb.x, by(k), bb.w, C.sand);
    const order = [0, 3, 4, 1];                  // Vanta, Probe, Rivet, Pixel: the approved hires, in the order they merged
    order.forEach((ai, j) => {
      const ag = A(ai), td = EV.payoffT[j];
      const fromLeft = j % 2 === 0;
      const s = E.out(pr(t, td, td + 0.8));
      const x0 = fromLeft ? ST.x - 270 : ST.x + ST.w + 20;
      const x = lerp(x0, bb.x, s);
      const al = clamp((t - td) / 0.15);
      if (al > 0) bar(x, by(3 + j), bb.w, ag.fill, { alpha: al, label: ag.name });
      const dn = pr(t, td + 0.8, td + 1.1);
      if (dn > 0) { ctx.save(); ctx.globalAlpha *= dn; badge(bb.x + bb.w + 28, by(3 + j) + 17, "ok"); ctx.restore(); }
    });
    // the three promises, each drawn with an object from the film
    const pa = pr(t, 70.0, 70.5), pb = pr(t, 70.6, 71.1), pc = pr(t, 71.2, 71.7);
    if (pa > 0) {
      ctx.save(); ctx.globalAlpha *= pa;
      box(255, 440, 150, 220, C.paper, { lw: 3 });
      shapeC("L", 288, 482, 12, C.orange, 1);
      for (let k = 0; k < 3; k++) bar(266, 530 + k * 40, 128, C.sand);
      T("own repo", 330, 716, { size: 34, align: "center" });
      ctx.restore();
    }
    if (pb > 0) {
      ctx.save(); ctx.globalAlpha *= pb;
      box(1568, 430, 44, 44, C.orange, { lw: 3 });
      T("paycheck", 1590, 540, { size: 34, align: "center" });
      ctx.restore();
    }
    if (pc > 0) {
      ctx.save(); ctx.globalAlpha *= pc;
      box(1470, 630, 240, 30, C.paper, { lw: 3 });
      box(1470, 630, 240 * 0.82, 30, C.orange, { lw: 3 });
      T("track record", 1590, 716, { size: 34, align: "center" });
      ctx.restore();
    }
    ctx.restore();
  }

  // =====================================================================================================
  // v3 NEW: the scale scene. 5 agents -> 100 agents, the merge tree vs one queue, five levels of ten,
  // "can a human watch 100? no", review by exception. All numbers come from facts.js (null = not drawn).
  // =====================================================================================================
  const FX = (s) => CAPCHUNK.fill(s);
  const hsh = (a, k = 0) => { let x = (Math.imul(a + 1, 2654435761) ^ Math.imul(k + 7, 40503)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  const SC = TL.segs.open.sc;
  const NAG = SCALE.agents, NCR = SCALE.crews, PER = Math.round(NAG / NCR);
  const SHP = ["L", "T", "S", "O", "J"], RFILL = [C.orange, C.yellow, C.ink, C.sand, STONE];
  const CB = { x: 96, y: 372, w: 330, h: 244, gap: 19.5, gapY: 20 };
  const crewRect = (c) => ({ x: CB.x + (c % 5) * (CB.w + CB.gap), y: CB.y + Math.floor(c / 5) * (CB.h + CB.gapY), w: CB.w, h: CB.h });
  const agentXY = (a) => { const c = Math.floor(a / PER), k = a % PER, r = crewRect(c); return { x: r.x + 33 + (k % 5) * 66, y: r.y + 96 + Math.floor(k / 5) * 82 }; };
  const yardName = (a) => "yard-" + String(a + 1).padStart(3, "0");
  const FLAG_IDS = [23, 57, 81, 12, 44, 68, 90, 5, 36, 74];
  const FLAG_WHY = ["conflict, second try", "Inspector: failed", "touches config"];
  function crewBox(c, alpha = 1) {
    const r = crewRect(c); ctx.save(); ctx.globalAlpha *= alpha;
    box(r.x, r.y, r.w, r.h, C.paper2, { lw: 3 });
    T("crew " + String(c + 1).padStart(2, "0"), r.x + 16, r.y + 38, { size: 26, fill: C.muted });
    ctx.restore();
  }
  // st: 0 idle (hollow), 1 working (filled), 2 merged (filled + tick), 3 flagged (hatched, dashed ring)
  function glyph(a, st, o = {}) {
    const p = agentXY(a), al = o.alpha ?? 1; if (al <= 0) return;
    ctx.save(); ctx.globalAlpha *= al;
    const u = 12 * (1 + 0.14 * (o.bump ?? 0));
    if (st === 3) { hatch(p.x - 34, p.y - 38, 68, 76, 0.55); box(p.x - 34, p.y - 38, 68, 76, null, { lw: 3, dash: [8, 5] }); }
    shapeC(SHP[a % 5], p.x, p.y - 4, u, st === 0 ? C.paper : RFILL[a % 5]);
    const n = o.ticks ?? 0;
    for (let k = 0; k < 3; k++) box(p.x - 17 + k * 12, p.y + 30, 9, 9, k < n ? C.ink : C.paper, { lw: 2 });
    if (st === 2) checkGlyph(p.x + 25, p.y - 27, 14, C.ink, 3.5);
    ctx.restore();
  }
  const pulseA = (dt) => (dt < 0 || dt > 0.45 ? 0 : dt < 0.08 ? dt / 0.08 : 1 - (dt - 0.08) / 0.37);
  function gridAgent(a, t, sec, vis = 1) {
    const base = { alpha: vis };
    if (sec === "A") return { st: 1, o: { alpha: vis * pr(t - 0, 0, 1) } };
    if (sec === "B" || sec === "E") {
      let n = 0, bump = 0;
      for (let j = 0; j < 3; j++) {
        const tc = sec === "B" ? SC.b[0] + 0.5 + (j + hsh(a, j)) * 1.7 : 0;
        if (sec === "B") { if (t >= tc) n++; bump = Math.max(bump, pulseA(t - tc)); }
      }
      if (sec === "E") { n = 3; const ph = (t * 3.1 + hsh(a, 9) * 6.28); bump = Math.sin(ph) > 0.82 ? 1 : 0; }
      return { st: 1, o: { alpha: vis, ticks: n, bump } };
    }
    return { st: 1, o: base };
  }

  // ---- A: the slider, 5 -> 100, crews and agents appear ----
  function scaleA(t) {
    const v = CREW.agents + (NAG - CREW.agents) * E.io(pr(t, 34.9, 38.2));
    const sa = pr(t, 33.4, 33.9) * (1 - pr(t, 40.0, 40.6));
    if (sa > 0) {
      ctx.save(); ctx.globalAlpha *= sa;
      T("CREW SIZE", 96, 326, { size: 26, fill: C.muted });
      const x0 = 330, w = 900, frac = (v - CREW.agents) / (NAG - CREW.agents);
      box(x0, 310, w, 16, C.paper, { lw: 3 }); box(x0, 310, Math.max(4, w * frac), 16, C.orange, { lw: 3 });
      T(String(CREW.agents), x0, 358, { size: 24, fill: C.muted }); T(String(NAG), x0 + w, 358, { size: 24, fill: C.muted, align: "right" });
      const tx = x0 + w * frac;
      box(tx - 16, 296, 32, 44, C.ink, { lw: 3 }); box(tx - 3, 306, 6, 24, C.paper, { lw: 1 });
      T(String(Math.round(v)), 1290, 340, { font: TY.serif, weight: 600, size: 66 });
      T("agents", 1400, 336, { size: 28, fill: C.muted });
      const ca = pr(t, 34.2, 34.6) * (1 - pr(t, 38.4, 38.8));
      if (ca > 0) cursor(tx + 6, 318 + 4, ca);
      ctx.restore();
    }
    for (let c = 0; c < NCR; c++) crewBox(c, c === 0 ? pr(t, 33.4, 33.9) : pr(v, c * PER - 1, c * PER + 6));
    for (let a = 0; a < NAG; a++) {
      const vis = a < CREW.agents ? pr(t, 33.4, 33.9) : pr(v - a, 0, 1.6);
      if (vis > 0) glyph(a, 1, { alpha: vis, bump: a >= CREW.agents ? pulseA(t - (34.9 + 3.3 * Math.min(1, (a - CREW.agents) / (NAG - CREW.agents)))) : 0 });
    }
  }
  // ---- B: every agent works in its own fork (hundred glyphs, commit ticks land at different moments) ----
  function statusStrip(t, a0, a1) {
    const a = pr(t, a0, a0 + 0.5) * (1 - pr(t, a1 - 0.4, a1)); if (a <= 0) return;
    let s = `${NAG} agents  ·  ${SCALE.forks ?? NAG} forks  ·  ${NCR} crews`;
    if (SCALE.commits !== null) s += `  ·  ${SCALE.commits} commits`;
    T(s, 96, 330, { size: 32, alpha: a });
  }
  function gridLayer(t, sec, vis) {
    for (let c = 0; c < NCR; c++) crewBox(c, vis);
    for (let a = 0; a < NAG; a++) { const g = gridAgent(a, t, sec, vis); glyph(a, g.st, g.o); }
  }

  // ---- C: one queue vs a merge tree ----
  const CONFL = {}; [2, 6, 9, 4, 7, 1, 3, 5, 8, 0].slice(0, Math.min(NCR, SCALE.conflicts ?? 3)).forEach((c) => { CONFL[c] = PER - 1; });   // crew -> member whose delivery conflicts (the last one); count from facts
  const cStart = (c) => 47.3 + 0.06 * c;
  const memT = (c, j) => cStart(c) + 0.72 * j;
  const crewDone = (c) => (CONFL[c] !== undefined ? memT(c, CONFL[c]) + 4.4 : memT(c, PER - 1) + 0.5);
  function scaleC(t) {
    const a = pr(t, 46.2, 46.8) * (1 - pr(t, 60.6, 61.0)); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    const L = { x: 96, y: 284, w: 840, h: 600 }, R = { x: 984, y: 284, w: 840, h: 600 };
    panel(L, null, { fill: C.paper2 }); panel(R, null, { fill: C.paper2 });
    T("One queue", L.x + 22, L.y + 48, { size: 34 }); T("GitHub: one merge at a time", L.x + 22, L.y + 82, { size: 24, fill: C.muted });
    T("A merge tree", R.x + 22, R.y + 48, { size: 34 }); T("Forkyard: crews merge in parallel", R.x + 22, R.y + 82, { size: 24, fill: C.muted });
    // queue: 100 cells filled one at a time
    const qx = L.x + 202, qy = L.y + 126, n = Math.max(0, Math.floor((t - 47.2) / 0.55));
    for (let i = 0; i < NAG; i++) {
      const x = qx + (i % 10) * 44, y = qy + Math.floor(i / 10) * 44;
      box(x, y, 34, 34, i < n ? C.ink : C.paper, { lw: 3 });
      if (i === n) { hatch(x, y, 34, 34, 0.9); }
    }
    T("one at a time · illustrative pace", L.x + 22, L.y + L.h - 18, { size: 22, fill: C.muted });
    // tree
    const mx = R.x + 420, my = R.y + 112;
    const cx = (c) => R.x + 60 + c * 80, ny = R.y + 300, dy = R.y + 400;
    let merged = 0; for (let c = 0; c < NCR; c++) if (t >= crewDone(c) + 0.35) merged++;
    // edges: dots -> crew line, crew line -> main
    for (let c = 0; c < NCR; c++) {
      const lit = t >= crewDone(c) + 0.35;
      ctx.save(); ctx.lineWidth = lit ? 4 : 2.5; ctx.strokeStyle = lit ? C.ink : C.line;
      ctx.beginPath(); ctx.moveTo(cx(c), ny); ctx.lineTo(mx, my + 44); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx(c), dy - 8); ctx.lineTo(cx(c), ny + 30); ctx.stroke();
      ctx.restore();
    }
    for (let c = 0; c < NCR; c++) {
      const done = t >= crewDone(c);
      box(cx(c) - 34, ny, 68, 30, done ? C.orange : C.paper, { lw: 3 });
      T("c" + (c + 1), cx(c), ny + 22, { size: 18, align: "center" });
      for (let k = 0; k < PER; k++) {
        const x = cx(c) - 28 + (k % 5) * 12, y = dy + Math.floor(k / 5) * 16;
        const tm = memT(c, k), isC = CONFL[c] === k;
        const conflict = isC && t >= tm && t < tm + 4.4;
        const m = isC ? t >= tm + 4.4 : t >= tm + 0.3;
        box(x, y, 10, 10, m ? C.ink : C.paper, { lw: 2 });
        if (conflict) { hatch(x - 2, y - 2, 14, 14, 1); crossGlyph(x + 5, y + 5, 8, C.ink, 2.5); box(x - 5, y - 5, 20, 20, null, { lw: 2.5, dash: [4, 3] }); }
        if (isC && t >= tm + 1.2 && t < tm + 3.2) {              // the delivery goes back to the agent that caused it, then comes back fresh
          const u = (t - tm - 1.2) / 2.0, s2 = Math.sin(u * Math.PI);
          ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(x + 6, y + 14); ctx.quadraticCurveTo(x - 30, y + 54 + 10 * s2, x - 8, y + 62); ctx.stroke(); ctx.restore();
          box(x - 10 - 16 * s2, y + 52 + 10 * s2, 12, 12, RFILL[(c * 10 + k) % 5], { lw: 2 });
        }
      }
    }
    // main
    box(mx - 100, my, 200, 44, C.paper, { lw: 3 }); box(mx - 100, my, 200 * (merged / NCR), 44, C.orange, { lw: 3 });
    T("main", mx, my + 31, { size: 28, align: "center" });
    if (merged >= NCR) { badge(mx + 130, my + 22, "ok", pr(t, Math.max(...Array.from({ length: NCR }, (_, c) => crewDone(c))) + 0.4, Math.max(...Array.from({ length: NCR }, (_, c) => crewDone(c))) + 0.7)); }
    // explanatory card for the first conflict
    const cf0 = Object.keys(CONFL).map(Number)[0]; const t1 = memT(cf0, 9), ca = pr(t, t1 + 0.3, t1 + 0.6) * (1 - pr(t, t1 + 4.0, t1 + 4.4));
    if (ca > 0) {
      ctx.save(); ctx.globalAlpha *= ca;
      box(R.x + 40, R.y + 484, 540, 62, C.paper, { lw: 3 });
      T(yardName(cf0 * PER + CONFL[cf0]) + ": conflict", R.x + 54, R.y + 510, { size: 22 });
      T(t - t1 < 3.2 ? "returned to the agent that caused it" : "re-delivered on fresh main", R.x + 54, R.y + 536, { size: 20, fill: C.muted });
      ctx.restore();
    }
    T(`${NCR} crews in parallel · ${Math.ceil(Math.log(NAG) / Math.log(PER))} levels`, R.x + 22, R.y + R.h - 18, { size: 24, fill: C.muted, alpha: pr(t, 47.6, 48.2) });
    if (SCALE.ms !== null) { T(`real run: merged in ${(SCALE.ms / 1000).toFixed(1)} s · ${SCALE.resolved ?? SCALE.conflicts} conflicts resolved`, R.x + 22, R.y + R.h - 52, { size: 24, alpha: pr(t, 59.6, 60.2) }); }
    ctx.restore();
  }
  // ---- D: five levels of ten (by design) ----
  function scaleD(t) {
    const a = pr(t, 61.0, 61.5) * (1 - pr(t, 70.2, 70.6)); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    const lv = DESIGN.levels, x0 = 560, bw = 1200;
    for (let i = 0; i < lv; i++) {
      const y = 296 + i * 112, ta = pr(t, 61.5 + i * 1.15, 62.1 + i * 1.15); if (ta <= 0) continue;
      const count = Math.pow(DESIGN.fanout, i + 1), ran = count === SCALE.agents, byDesign = count > SCALE.agents;
      ctx.save(); ctx.globalAlpha *= ta; ctx.translate(0, (1 - E.out(ta)) * 16);
      T(count.toLocaleString("en-US"), 96, y + 38, { font: TY.serif, weight: 600, size: 44 });
      T(ran ? "we ran this" : byDesign ? "by design" : "a crew", 96, y + 62, { size: 20, fill: ran ? C.ink : C.muted, alpha: 1 });
      if (ran) badge(400, y + 30, "ok", 1);
      box(x0, y, bw, 64, C.paper, { lw: ran ? 6 : 3, dash: byDesign ? [12, 8] : null });
      for (let k = 1; k < DESIGN.fanout; k++) { ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0 + k * bw / DESIGN.fanout, y + 6); ctx.lineTo(x0 + k * bw / DESIGN.fanout, y + 58); ctx.stroke(); ctx.restore(); }
      box(x0, y, bw / DESIGN.fanout, 64, i === 0 ? C.orange : C.paper2, { lw: 3 });
      if (i < lv - 1) {                                              // fan-out from the first segment to the full next row
        ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(x0 + 8, y + 64); ctx.lineTo(x0, y + 112); ctx.moveTo(x0 + bw / DESIGN.fanout - 8, y + 64); ctx.lineTo(x0 + bw, y + 112); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  // ---- E: can a human watch 100 agents? ----
  function scaleE(t) {
    const a = pr(t, SC.e[0], SC.e[0] + 0.5); if (a <= 0) return;
    gridLayer(t, "E", a);
    // a person's attention: one crew at a time
    const k = Math.floor((t - SC.e[0]) / 0.9) % NCR, r = crewRect((k * 7) % NCR);
    ctx.save(); ctx.globalAlpha *= a; box(r.x - 6, r.y - 6, r.w + 12, r.h + 12, null, { lw: 5, dash: [14, 8] }); ctx.restore();
    ctx.save(); ctx.globalAlpha *= a * (1 - pr(t, 75.4, 75.9));
    ctx.beginPath(); ctx.arc(1730, 320, 20, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
    T("you", 1764, 330, { size: 26, fill: C.muted });
    T("your attention", 1130, 330, { size: 26, fill: C.muted, align: "right" });
    ctx.restore();
    const na = win(t, 73.8, 75.9, 0.25, 0.35);
    if (na > 0) {
      ctx.save(); ctx.globalAlpha *= na;
      box(660, 450, 600, 260, C.paper, { lw: 5 });
      T("No.", 960, 640, { font: TY.serif, weight: 600, size: 190, align: "center" });
      ctx.restore();
    }
  }
  // ---- F: review by exception ----
  function scaleF(t) {
    const s = lerp(1, 0.62, E.io(pr(t, SC.f[0], SC.f[0] + 0.9)));
    const nFlag = Math.min(REVIEW.flagged, FLAG_IDS.length), flagged = FLAG_IDS.slice(0, nFlag);
    const conv = pr(t, SC.f[0] + 1.0, SC.f[0] + 1.8);
    ctx.save(); ctx.translate(96, 372); ctx.scale(s, s); ctx.translate(-96, -372);
    for (let c = 0; c < NCR; c++) crewBox(c, 1);
    for (let a = 0; a < NAG; a++) {
      const isF = flagged.includes(a);
      if (conv <= 0) { const g = gridAgent(a, t, "E", 1); glyph(a, g.st, g.o); continue; }
      glyph(a, isF ? 3 : 2, { alpha: isF ? 1 : lerp(1, 0.5, conv), ticks: 3 });
    }
    ctx.restore();
    // right column
    const ra = pr(t, SC.f[0] + 0.6, SC.f[0] + 1.2) * (1 - pr(t, 82.1, 82.4)); if (ra <= 0) return;
    ctx.save(); ctx.globalAlpha *= ra;
    T("NEEDS YOU", 1236, 322, { size: 32 });
    for (let i = 0; i < nFlag; i++) {
      const ta = pr(t, 77.4 + 0.5 * i, 77.9 + 0.5 * i); if (ta <= 0) continue;
      const y = 346 + i * 150, id = flagged[i];
      ctx.save(); ctx.globalAlpha *= ta; ctx.translate((1 - E.out(ta)) * 40, 0);
      box(1236, y, 588, 130, C.paper, { lw: 3 });
      shapeC(SHP[id % 5], 1290, y + 62, 14, RFILL[id % 5], 1);
      T(yardName(id), 1344, y + 52, { size: 30 });
      T(FLAG_WHY[i % FLAG_WHY.length], 1344, y + 90, { size: 24, fill: C.muted });
      box(1650, y + 36, 150, 50, C.ink, { lw: 3 }); T("Review", 1725, y + 69, { size: 26, align: "center", fill: C.paper });
      ctx.restore();
      const p = agentXY(id), px = 96 + (p.x - 96) * s, py = 372 + (p.y - 372) * s;
      ctx.save(); ctx.globalAlpha *= ta * 0.9; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(px + 22, py); ctx.lineTo(1236, y + 65); ctx.stroke(); ctx.restore();
    }
    const aa = pr(t, 79.4, 80.0);
    if (aa > 0) {
      ctx.save(); ctx.globalAlpha *= aa;
      badge(1256, 832, "ok", 1); T(`${REVIEW.auto} approved automatically`, 1296, 842, { size: 28 });
      if (REVIEW.illustrative) T("example numbers", 1296, 876, { size: 20, fill: C.muted });
      ctx.restore();
    }
    ctx.restore();
  }
  function scaleScene(t) {
    if (t < SC.a[0] - 0.1 || t >= SC.f[1] + 0.1) return;
    ctx.fillStyle = C.paper; ctx.fillRect(0, 262, W, 636);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 262, W, 636); ctx.clip();
    if (t < SC.b[0]) scaleA(t);
    else if (t < SC.c[0] + 0.6) {
      const vis = 1 - pr(t, SC.c[0], SC.c[0] + 0.5);
      statusStrip(t, SC.b[0], SC.c[0]);
      if (vis > 0) gridLayer(t, "B", vis);
    }
    if (t >= SC.c[0] && t < SC.d[0] + 0.1) scaleC(t);
    if (t >= SC.d[0] && t < SC.e[0] + 0.1) scaleD(t);
    if (t >= SC.e[0] && t < SC.f[0]) scaleE(t);
    if (t >= SC.f[0]) scaleF(t);
    ctx.restore();
  }

  // =====================================================================================================
  // v3 NEW: under the hood (Artifacts, Durable Objects, merge engine, Workers AI, x402). Local clock = segment time.
  // =====================================================================================================
  const HOOD_BEATS = [[3.9, 19.0], [19.2, 24.1], [24.3, 30.0], [30.2, 35.7], [35.9, 43.0]];
  const HOOD_NAMES = [["Artifacts", "the repos"], ["Durable Objects", "the state"], ["Merge engine", "the merges"], ["Workers AI", "the models"], ["x402", "the payouts"]];
  const SHA = ["a1f3", "c09b", "e7d2", "3b8a", "9c2e", "5d71", "f4a6", "08ce"];
  const hbeat = (i, t) => t >= HOOD_BEATS[i][0] - 0.2 && t < HOOD_BEATS[i][1] + 0.3;
  const hAlpha = (i, t) => pr(t, HOOD_BEATS[i][0], HOOD_BEATS[i][0] + 0.5) * (1 - pr(t, HOOD_BEATS[i][1] - 0.1, HOOD_BEATS[i][1] + 0.3));
  function hoodScene(t) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 262, W, 636);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 262, W, 636); ctx.clip();
    // five chips: the stack, always on screen; the active one is inverted
    HOOD_NAMES.forEach(([n, s], i) => {
      const x = 96 + i * 349.5, a = pr(t, 0.5 + 0.25 * i, 1.0 + 0.25 * i); if (a <= 0) return;
      const act = t >= HOOD_BEATS[i][0] && t < HOOD_BEATS[i][1] + 0.1;
      ctx.save(); ctx.globalAlpha *= a * (act || t < HOOD_BEATS[0][0] ? 1 : 0.62); ctx.translate(0, (1 - E.out(a)) * 14);
      box(x, 284, 330, 84, act ? C.ink : C.paper, { lw: 3 });
      T(n, x + 20, 328, { size: 30, fill: act ? C.paper : C.ink });
      T(s, x + 20, 356, { size: 22, fill: act ? C.paper : C.muted });
      ctx.restore();
    });
    // ---- 1: Artifacts. a mainline, a fork per agent, a write token with a TTL, time travel with readFile ----
    let a1 = hAlpha(0, t);
    if (a1 > 0) {
      ctx.save(); ctx.globalAlpha *= a1;
      box(96, 410, 250, 330, C.paper2, { lw: 3 }); T("mainline", 116, 452, { size: 30 });
      for (let k = 0; k < 3; k++) bar(120, 480 + k * 44, 200, C.sand);
      for (let i = 0; i < NA; i++) {
        const ta = pr(t, 4.4 + 0.35 * i, 4.9 + 0.35 * i), y = 410 + i * 66, x = 470;
        if (ta <= 0) continue;
        ctx.save(); ctx.globalAlpha *= ta; ctx.translate((1 - E.out(ta)) * -30, 0);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(346, 575); ctx.lineTo(x, y + 28); ctx.stroke();
        box(x, y, 470, 56, C.paper, { lw: 3 });
        shapeC(A(i).shape, x + 32, y + 28, 9, A(i).fill, 1);
        T("fork · " + A(i).name.toLowerCase(), x + 66, y + 36, { size: 24 });
        keyGlyph(x + 270, y + 17, C.orange);
        const f = 1 - 0.7 * pr(t, 6 + 0.1 * i, 12.8); box(x + 340, y + 20, 110, 16, C.paper2, { lw: 2 }); box(x + 340, y + 20, 110 * f, 16, C.orange, { lw: 2 });
        ctx.restore();
      }
      // right: the token, then time travel
      const tk = 1 - pr(t, 12.4, 13.1), tt = pr(t, 13.0, 13.6);
      if (tk > 0) {
        ctx.save(); ctx.globalAlpha *= tk * pr(t, 5.2, 5.8);
        box(1060, 410, 740, 330, C.paper, { lw: 3 });
        T("CONTRACT TOKEN", 1084, 452, { size: 26, fill: C.muted });
        keyGlyph(1090, 480, C.orange);
        T("scope: write", 1180, 505, { size: 30 }); T("repo: this agent's fork only", 1084, 560, { size: 26 }); T("expires: when the contract ends", 1084, 598, { size: 26 });
        const f = 1 - 0.7 * pr(t, 6, 12.8); box(1084, 640, 420, 22, C.paper2, { lw: 3 }); box(1084, 640, 420 * f, 22, C.orange, { lw: 3 });
        T("TTL", 1520, 660, { size: 24, fill: C.muted });
        ctx.restore();
      }
      if (tt > 0) {
        ctx.save(); ctx.globalAlpha *= tt;
        box(1060, 410, 740, 330, C.paper, { lw: 3 });
        T("TIME TRAVEL", 1084, 452, { size: 26, fill: C.muted });
        const sc = E.io(pr(t, 13.6, 18.0)), k = Math.round(7 * (1 - Math.abs(1 - 2 * sc * 1)) * 1);   // out to an old sha and back to head
        const pos = Math.min(7, Math.max(0, Math.round(7 * (sc < 0.5 ? 1 - sc * 2 * 0.8 : 0.2 + (sc - 0.5) * 2 * 0.8))));
        for (let i = 0; i < 8; i++) { const x = 1100 + i * 80; box(x, 486, 14, 40, i === pos ? C.ink : C.paper, { lw: 3 }); T(SHA[i], x + 7, 556, { size: 18, align: "center", fill: i === pos ? C.ink : C.muted }); }
        T(`readFile({ ref: "${SHA[pos]}", path: "index.html" })`, 1084, 612, { size: 22 });
        box(1084, 632, 692, 90, C.paper2, { lw: 3 });
        for (let r = 0; r < 3; r++) box(1100, 646 + r * 24, 120 + 380 * hsh(pos, r), 12, C.sand, { lw: 2 });
        ctx.restore();
      }
      ctx.restore();
    }
    // ---- 2: Durable Objects. a Job per goal, a Desk per agent ----
    const a2 = hAlpha(1, t);
    if (a2 > 0) {
      ctx.save(); ctx.globalAlpha *= a2;
      box(640, 410, 640, 120, C.paper, { lw: 4 }); T("Job", 664, 452, { size: 34 }); T("one Durable Object per goal", 664, 484, { size: 22, fill: C.muted });
      ["plan", "budget", "events"].forEach((s, i) => { box(1040 + i * 80, 440, 76, 36, C.paper2, { lw: 2 }); T(s, 1040 + i * 80 + 38, 465, { size: 18, align: "center" }); });
      for (let i = 0; i < NA; i++) {
        const ta = pr(t, 19.9 + 0.3 * i, 20.4 + 0.3 * i), x = 96 + i * 349.5; if (ta <= 0) continue;
        ctx.save(); ctx.globalAlpha *= ta; ctx.translate(0, (1 - E.out(ta)) * 20);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(960, 530); ctx.lineTo(x + 165, 640); ctx.stroke();
        box(x, 640, 330, 150, C.paper, { lw: 3 });
        shapeC(A(i).shape, x + 44, 700, 12, A(i).fill, 1);
        T("Desk · " + A(i).name, x + 90, 696, { size: 26 }); T("one Durable Object", x + 90, 728, { size: 20, fill: C.muted }); T("its own state", x + 90, 756, { size: 20, fill: C.muted });
        ctx.restore();
      }
      ctx.restore();
    }
    // ---- 3: merge engine. JSON in, structured conflicts out ----
    const a3 = hAlpha(2, t);
    if (a3 > 0) {
      ctx.save(); ctx.globalAlpha *= a3;
      const mk = (x, y, w, h, title, lines, o = {}) => { box(x, y, w, h, C.paper, { lw: 3 }); T(title, x + 18, y + 36, { size: 24, fill: C.muted }); lines.forEach((l, i) => T(l, x + 18, y + 78 + i * 34, { size: 24 })); };
      const s1 = pr(t, 24.6, 25.3);
      if (s1 > 0) { ctx.save(); ctx.globalAlpha *= s1; mk(96, 420, 520, 300, "CHANGE SET (JSON)", ['{ "agent": "pixel",', '  "base":  "9c2e",', '  "edits": [', '    { "path": "motion.js",', '      "op": "replace" } ] }']); ctx.restore(); }
      const s2 = pr(t, 25.6, 26.2);
      if (s2 > 0) { ctx.save(); ctx.globalAlpha *= s2; box(740, 520, 300, 100, C.ink, { lw: 3 }); T("merge engine", 890, 580, { size: 30, align: "center", fill: C.paper }); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(616, 570); ctx.lineTo(740, 570); ctx.stroke(); ctx.restore(); }
      const s3 = pr(t, 27.0, 27.6), s4 = pr(t, 28.0, 28.6);
      if (s3 > 0) { ctx.save(); ctx.globalAlpha *= s3; mk(1160, 400, 640, 150, "MERGED", ['{ "path": "motion.js", "status": "merged" }']); badge(1760, 436, "ok", 1); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1040, 560); ctx.lineTo(1160, 475); ctx.stroke(); ctx.restore(); }
      if (s4 > 0) { ctx.save(); ctx.globalAlpha *= s4; mk(1160, 580, 640, 240, "CONFLICT (DATA, NOT MARKERS)", ['{ "path": "index.html",', '  "base":   ["<header>"],', '  "ours":   ["<header class=\'hero\'>"],', '  "theirs": ["<header class=\'pills\'>"] }']); badge(1760, 616, "x", 1); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1040, 590); ctx.lineTo(1160, 660); ctx.stroke(); ctx.restore(); }
      ctx.restore();
    }
    // ---- 4: Workers AI ----
    const a4 = hAlpha(3, t);
    if (a4 > 0) {
      ctx.save(); ctx.globalAlpha *= a4;
      for (let i = 0; i < NA; i++) {
        const ta = pr(t, 30.5 + 0.2 * i, 30.9 + 0.2 * i), y = 430 + i * 74; if (ta <= 0) continue;
        ctx.save(); ctx.globalAlpha *= ta; shapeC(A(i).shape, 140, y + 24, 10, A(i).fill, 1); T(A(i).name, 190, y + 32, { size: 26 });
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(340, y + 24); ctx.lineTo(600, 580); ctx.stroke(); ctx.restore();
      }
      const ma = pr(t, 31.2, 31.8);
      if (ma > 0) {
        ctx.save(); ctx.globalAlpha *= ma;
        box(600, 480, 560, 200, C.ink, { lw: 3 }); T("Workers AI", 630, 540, { size: 34, fill: C.paper });
        T("@cf/zai-org/glm-5.3-flash", 630, 590, { size: 26, fill: C.paper }); T("plan · code · inspect", 630, 640, { size: 24, fill: C.paper });
        ctx.restore();
      }
      const code = ["export function lease(files) {", "  return files.filter(isSafe);", "}", "// commit: task 3 of 8"], na = pr(t, 32.2, 32.5);
      if (na > 0) { ctx.save(); ctx.globalAlpha *= na; box(1240, 430, 560, 260, C.paper2, { lw: 3 }); let seen = 0;
        code.forEach((ln, i) => { const part = typed(ln, t, 32.4 + seen / 55, 55); seen += ln.length; T(part, 1260, 480 + i * 44, { size: 24 }); }); ctx.restore(); }
      ctx.restore();
    }
    // ---- 5: x402 payouts ----
    const a5 = hAlpha(4, t);
    if (a5 > 0) {
      ctx.save(); ctx.globalAlpha *= a5;
      box(96, 470, 330, 160, C.paper, { lw: 4 }); T("Job wallet", 116, 520, { size: 32 }); T("holds the budget", 116, 556, { size: 22, fill: C.muted }); T("test USDC", 116, 594, { size: 22, fill: C.muted });
      for (let j = 0; j < 4; j++) {
        const ag = [0, 1, 3, 4][j], y = 410 + j * 100, ta = pr(t, 36.6 + 0.25 * j, 37.1 + 0.25 * j);
        if (ta <= 0) continue;
        ctx.save(); ctx.globalAlpha *= ta;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(426, 550); ctx.lineTo(1100, y + 30); ctx.stroke(); ctx.setLineDash([]);
        box(1100, y, 360, 62, C.paper, { lw: 3 }); shapeC(A(ag).shape, 1136, y + 31, 9, A(ag).fill, 1); T(A(ag).name, 1176, y + 40, { size: 26 }); T("0x…", 1340, y + 40, { size: 24, fill: C.muted });
        const cs = E.io(pr(t, 37.8 + 0.3 * j, 38.8 + 0.3 * j)); if (cs > 0 && cs < 1) box(lerp(426, 1090, cs) - 11, lerp(550, y + 31, cs) - 11, 22, 22, C.orange, { lw: 3 });
        ctx.restore();
      }
      const ch = pr(t, 39.2, 39.7);
      if (ch > 0) { ctx.save(); ctx.globalAlpha *= ch; box(1500, 410, 300, 140, C.paper2, { lw: 3 }); T("Base Sepolia", 1520, 464, { size: 28 }); T("testnet", 1520, 504, { size: 28, fill: C.orangeDeep }); T("simulated unless funded", 1520, 536, { size: 18, fill: C.muted }); ctx.restore(); }
      const rj = pr(t, 39.9, 40.4);
      if (rj > 0) { ctx.save(); ctx.globalAlpha *= rj; crossGlyph(1520, 604, 24, C.ink, 4); T("rejected: not paid", 1556, 612, { size: 24 }); ctx.restore(); }
      ctx.restore();
    }
    ctx.restore();
  }
  // =====================================================================================================
  // v3 NEW: the close
  // =====================================================================================================
  function closeScene(t) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 262, W, 636);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 262, W, 636); ctx.clip();
    for (let a = 0; a < 100; a++) {
      const gx = a % 10, gy = Math.floor(a / 10), ta = pr(t, 0.4 + 0.045 * (gx + gy), 0.9 + 0.045 * (gx + gy)); if (ta <= 0) continue;
      const x = 150 + gx * 50, y = 330 + gy * 50;
      shapeC(SHP[a % 5], x, y, 9, RFILL[a % 5], ta);
    }
    const lines = [["One repo.", 4.4], ["A hundred agents.", 5.5], ["All at once.", 6.6]];
    lines.forEach(([s, t0], i) => { const a = pr(t, t0, t0 + 0.4); if (a > 0) T(s, 760, 430 + i * 96, { font: TY.serif, weight: 600, size: 76, alpha: a }); });
    const fa = pr(t, 9.4, 9.9);
    if (fa > 0) { ctx.save(); ctx.globalAlpha *= fa; box(760, 750, 880, 64, C.paper, { lw: 3 }); T("Forkyard · built on Cloudflare Workers + Artifacts", 784, 792, { size: 28 }); ctx.restore(); }
    const oa = pr(t, 10.6, 11.1);
    if (oa > 0) { ctx.save(); ctx.globalAlpha *= oa; box(1660, 750, 164, 64, C.ink, { lw: 3 }); T("open source", 1742, 777, { size: 20, align: "center", fill: C.paper }); T("(MIT)", 1742, 801, { size: 22, align: "center", fill: C.paper }); ctx.restore(); }
    ctx.restore();
  }

  // ---------- anchors, wordmark, captions ----------
  const SEG = TL.seg, SD = TL.segs[SEG];
  const CAPS_ARR = window.VODATA ? CAPCHUNK.captionsFor(VODATA.lines, SEG) : [];
  function anchors(t) {
    for (const [a, b, s0] of SD.headline) {
      if (t < a || t >= b) continue;
      const s = FX(s0), last = b >= TL.dur;
      const al = clamp((t - a) / 0.3) * (last ? 1 : clamp((b - t) / 0.22));
      const dy = RM ? 0 : (1 - E.out(pr(t, a, a + 0.5))) * 14;
      if (s === "Forkyard") {
        shapeC("L", 96 + 26, 150 - 22, 18, C.orange, al);
        T(s, 96 + 78, 150 + dy, { font: TY.serif, weight: 600, size: 96, alpha: al });
      } else T(s, 96, 150 + dy, { font: TY.serif, weight: 600, size: TOKENS.size.headline, alpha: al });
    }
    for (const [a, b, s0] of SD.sub) {
      if (t < a || t >= b) continue;
      const s = FX(s0), last = b >= TL.dur;
      const al = clamp((t - a) / 0.3) * (last ? 1 : clamp((b - t) / 0.22));
      const dy = RM ? 0 : (1 - E.out(pr(t, a, a + 0.5))) * 10;
      T(s, SEG === "close" ? 96 + 78 : 96, 224 + dy, { font: TY.serif, weight: 500, size: TOKENS.size.sub, fill: C.muted, alpha: al });
    }
  }
  function captions(t) {
    if (!CAPS) return;
    for (const [a, b, s] of CAPS_ARR) {
      if (t < a || t >= b) continue;
      const al = Math.min(clamp((t - a) / 0.15), clamp((b - t) / 0.15));
      const lines = s.split("\n");
      lines.forEach((ln, i) => T(ln, 960, (lines.length === 1 ? 975 : 944) + i * 54, { font: TY.serif, weight: 500, size: TOKENS.size.caption, fill: C.muted, align: "center", alpha: al }));
    }
  }

  // ---------- pieces: the opening replays the v2 world through a time map, with dissolves between pieces ----------
  function stageWorld(tw) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 262, W, 636); ctx.clip();
    ctx.fillStyle = C.paper; ctx.fillRect(0, 262, W, 636);
    const cam = camera(tw);
    ctx.translate(cam.cx, cam.cy); ctx.scale(cam.s, cam.s); ctx.translate(-cam.cx, -cam.cy);
    sceneS1S2(tw); lanes(tw); sceneS3(tw); leaseChipsLate(tw); sceneS4(tw); sceneS5(tw); sceneS6(tw);
    deliveries(tw); conflictCard(tw); sceneS8(tw); sceneS9(tw); agentLayer(tw); sceneS10(tw); sceneS11(tw); sceneReview(tw);
    ctx.restore();
  }
  function worldT(p, t) {
    const m = p.map; if (t <= m[0][0]) return m[0][1];
    for (let i = 1; i < m.length; i++) if (t <= m[i][0]) return lerp(m[i - 1][1], m[i][1], (t - m[i - 1][0]) / (m[i][0] - m[i - 1][0]));
    return m[m.length - 1][1];
  }
  function drawPiece(p, t) { if (p.kind === "world") stageWorld(worldT(p, t)); else scaleScene(t); }
  const mctx = cv.getContext("2d");
  const off = document.createElement("canvas"); off.width = W; off.height = H; const octx = off.getContext("2d");
  function openStage(t) {
    const P = SD.pieces; let i = P.findIndex((p) => t >= p.o0 && t < p.o1); if (i < 0) i = P.length - 1;
    const p = P[i], dt = t - p.o0;
    if (p.fade && i > 0 && dt < p.fade && !RM) {
      drawPiece(P[i - 1], P[i - 1].o1 - 1e-3);
      ctx = octx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
      drawPiece(p, t);
      ctx = mctx; ctx.save(); ctx.globalAlpha = E.io(dt / p.fade); ctx.drawImage(off, 0, 0); ctx.restore();
    } else drawPiece(p, t);
  }

  // ---------- frame ----------
  function frame(t) {
    ctx = mctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    if (SEG === "open") openStage(t);
    else {
      ctx.save(); ctx.globalAlpha = RM ? 1 : pr(t, 0, 0.4);
      if (SEG === "hood") hoodScene(t); else closeScene(t);
      ctx.restore();
    }
    anchors(t);
    captions(t);
  }

  window.TIMELINE = TL;
  window.seek = (t) => { frame(t); return t; };
  window.RM = RM;
  document.fonts.load("600 80px Newsreader").then(() => document.fonts.load("500 44px Newsreader")).then(() => document.fonts.load("400 30px 'JetBrains Mono'")).then(() => document.fonts.ready).then(() => {
    window.__ready = true;
    const tq = Q.get("t");
    window.seek(tq !== null ? parseFloat(tq) : 0);
  });
})();
