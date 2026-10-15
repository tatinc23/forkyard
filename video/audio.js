// Forkyard film: procedural sound. Web Audio only, seeded noise, every cue derived from the timeline (v2 world cues are mapped through segs.open.pieces).
// buildAudio({bed, cues}) -> Promise<AudioBuffer> for the current segment (?seg=). Tempo-locked at TOKENS.bpm (96).
(function (g) {
  const TL = TIMELINE, EV = TL.ev;
  const BEAT = 60 / TOKENS.bpm;
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);          // midi -> Hz
  const N = { D2: 38, A2: 45, B2: 47, G2: 43, D3: 50, E3: 52, Fs3: 54, G3: 55, A3: 57, B3: 59, Cs4: 61, D4: 62, E4: 64, Fs4: 66, A4: 69, B4: 71, D5: 74, Fs5: 78, D6: 86, Fs6: 90, A6: 93, B6: 95, Eb3: 51 };
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- the cue list: one entry per meaningful action; also written to sound-cues.json ----
  function v2Cues() {
    const c = [];
    const add = (t, type, arg = {}) => c.push({ t: +t.toFixed(3), type, ...arg });
    EV.humanBars.forEach((t) => add(t + 0.5, "tock", { note: N.D3, label: "human commit lands" }));
    EV.rounds.forEach((t) => add(t + 0.55, "thud", { label: "four agents collide on one repo" }));
    add(EV.splitT[0], "swoosh", { label: "repo splits into forks" });
    add(EV.goalT, "click", { label: "goal arrives" });
    for (let i = 0; i < 5; i++) add(EV.chipT + 0.1 * i, "tick", { note: N.A6, label: "lease chip" });
    add(EV.approvePlanT, "chime", { label: "human approves plan" });
    for (let i = 0; i < 5; i++) add(EV.hallT + 0.12 * i, "tick", { note: N.D6, label: "Hall card" });
    EV.pickT.forEach((t, i) => add(t, "pop", { note: [N.D4, N.Fs4, N.A4, N.B4, N.D5][i], label: "Foreman hires " + TL.agents[i] }));
    EV.tokenT.forEach((t) => add(t, "tick", { note: N.B6, label: "write token issued" }));
    const lane = [N.D3, N.Fs3, N.A3, N.B3, N.D4];
    EV.commits.forEach((row, i) => row.forEach((t) => add(t + 0.4, "task", { note: lane[i], label: "task commit lands in fork " + i })));
    add(EV.stampT[0], "tick", { note: N.A6, label: "measured number" });
    EV.inspVisit.forEach((t, i) => { add(t - 0.3, "scan", { label: "Inspector moves" }); add(t + 0.55, "check", { label: "review check" }); });
    TL.agents.forEach((id) => { const l = EV.lift[id]; add(l, "whoosh", { label: "delivery lifts" }); if (id !== EV.causer) add(l + 1.8, "tock", { note: N.D2 + 12, label: "merged into main" }); });
    add(EV.conflictT, "conflict", { label: "conflict" });
    add(EV.relandT[0], "rise", { label: "agent re-delivers" });
    add(EV.relandT[1], "tock", { note: N.D2 + 12, label: "the cause re-delivers and merges" });
    add(EV.relandT[1] + 0.1, "check", { label: "merged check" });
    // S8: the human visual review (lens, approve / reject)
    const RV = EV.review;
    RV.chStart.forEach((t, k) => { add(t, "scan", { label: "lens moves to chapter " + (k + 1) }); });
    RV.verdictT.forEach((t, k) => { if (k === RV.reject) { add(t, "thunk", { label: "chapter rejected" }); } else { add(t, "click", { label: "chapter approved" }); add(t + 0.05, "check", { label: "approved check" }); } });
    add(RV.revertT[0], "swoosh", { soft: 1, label: "rejected change reverted" });
    // S9: approve and pay
    add(EV.clickT, "click", { label: "human approves and pays" });
    add(EV.clickT + 0.12, "chime", { label: "approval chime" });
    EV.payees.forEach((lane, pi) => { for (let k = 0; k < 3; k++) add(EV.coinT0 + 0.12 * pi + 0.22 * k + 0.95, "tink", { note: [N.D6, N.Fs6, N.A6, N.B6][pi], label: "x402 payment arrives" }); });
    for (let i = 0; i < 5; i++) add(EV.expireT + 0.05 * i, "thunk", { label: "token expires" });
    add(EV.repT[0], "glide", { label: "reputation updates" });
    add(EV.swapT[0], "swoosh", { label: "rank swap" });
    EV.roundOffsets.forEach((_, r) => add(EV.turnDrops + EV.turnGap * r + 0.55, "thud", { soft: 1, label: "shared repo pile-up, again" }));
    [0, 1, 2, 3].forEach((j) => add(EV.turnDrops + 0.5 + 0.4 * j + 0.45, "tock", { note: [N.D3, N.Fs3, N.A3, N.B3][j], label: "clean merge " + j }));
    add(EV.turnDrops + 1.95, "check", { label: "pile-up marked" });
    add(EV.turnDrops + 2.2, "chime", { label: "clean merge marked" });
    EV.reframeT.forEach((t) => { add(t, "swoosh", { soft: 1, label: "word changes meaning" }); add(t + 0.8, "tick", { note: N.D6, label: "new word lands" }); });
    [N.Fs4, N.A4, N.B4, N.D5].forEach((n, j) => add(EV.payoffT[j] + 0.8, "bell", { note: n, label: "payoff: motif lands as the 4 merges land" }));
    add(70.6, "tick", { note: N.A6, label: "promise" }); add(71.2, "tick", { note: N.B6, label: "promise" });
    return c.sort((a, b) => a.t - b.t);
  }


  // ---- v3: map the v2 world cues into the opening, then add the new scenes ----
  const hsh = (a, k = 0) => { let x = (Math.imul(a + 1, 2654435761) ^ Math.imul(k + 7, 40503)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  function worldToOpen(tw) {
    for (const p of TL.segs.open.pieces) {
      if (p.kind !== "world") continue;
      const m = p.map;
      for (let i = 1; i < m.length; i++) if (tw >= m[i - 1][1] && tw <= m[i][1]) return m[i - 1][0] + (tw - m[i - 1][1]) / (m[i][1] - m[i - 1][1]) * (m[i][0] - m[i - 1][0]);
    }
    return null;
  }
  function cueList() {
    const seg = TL.seg, c = [];
    const add = (t, type, arg = {}) => c.push({ t: +t.toFixed(3), type, ...arg });
    if (seg === "open") {
      for (const q of v2Cues()) { const o = worldToOpen(q.t); if (o !== null && !(q.type === "bell")) { const { t, ...rest } = q; add(o, rest.type, rest); } }
      const SC = TL.segs.open.sc, NAG = SCALE.agents, NCR = SCALE.crews, PER = NAG / NCR;
      add(34.9, "swoosh", { soft: 1, label: "slider drag starts" });
      const ease = (x) => x * x * (3 - 2 * x);
      for (let k = 1; k < NCR; k++) { const target = k * PER; let tt = 34.9; while (tt < 38.2 && 5 + (NAG - 5) * ease((tt - 34.9) / 3.3) < target) tt += 0.02; add(tt, "tick", { note: N.A6 + (k % 3), label: "a crew appears" }); }
      add(38.3, "chime", { label: "100 agents" });
      for (let a = 0; a < NAG; a += 4) for (let j = 0; j < 3; j++) add(SC.b[0] + 0.5 + (j + hsh(a, j)) * 1.7 + 0.4, "task", { note: [N.D3, N.Fs3, N.A3, N.B3, N.D4][a % 5], label: "task commit in a fork" });
      for (let i = 0; i < 26; i++) add(47.2 + 0.55 * i + 0.3, "tick", { note: N.D6, label: "the single queue lands one" });
      const CONFL = {}; [2, 6, 9, 4, 7, 1, 3, 5, 8, 0].slice(0, Math.min(NCR, SCALE.conflicts ?? 3)).forEach((cr) => { CONFL[cr] = PER - 1; });
      const memT = (cr, j) => 47.3 + 0.06 * cr + 0.72 * j;
      for (let cr = 0; cr < NCR; cr++) {
        const done = CONFL[cr] !== undefined ? memT(cr, CONFL[cr]) + 4.4 : memT(cr, PER - 1) + 0.5;
        add(done + 0.35, "tock", { note: [N.D3, N.Fs3, N.A3, N.B3, N.D4][cr % 5], label: "crew line merges into main" });
        if (CONFL[cr] !== undefined) { add(memT(cr, CONFL[cr]), "conflict", { label: "conflict" }); add(memT(cr, CONFL[cr]) + 1.2, "rise", { label: "returned to the cause" }); add(done, "check", { label: "re-delivered" }); }
      }
      add(59.6, "chime", { label: "all merged into main" });
      for (let i = 0; i < 5; i++) add(61.5 + 1.15 * i + 0.1, "tink", { note: [N.D6, N.Fs6, N.A6, N.B6, N.D6 + 12][i], label: "next level of ten" });
      add(62.7, "check", { label: "we ran this level" });
      add(SC.e[0], "swoosh", { soft: 1, label: "grid returns" });
      add(73.8, "thud", { label: "No." });
      add(SC.f[0] + 1.0, "swoosh", { label: "97 approved, the rest flagged" });
      for (let i = 0; i < 3; i++) add(77.4 + 0.5 * i, "pop", { note: [N.D4, N.Fs4, N.A4][i], label: "needs you" });
      add(79.4, "check", { label: "approved automatically" });
    } else if (seg === "hood") {
      [[3.9, N.D4], [19.2, N.Fs4], [24.3, N.A4], [30.2, N.B4], [35.9, N.D5]].forEach(([t, n], i) => add(t, "pop", { note: n, label: "stack chip " + i }));
      for (let i = 0; i < 5; i++) add(0.5 + 0.25 * i, "tick", { note: N.A6, label: "chip drops" });
      for (let i = 0; i < 5; i++) { add(4.4 + 0.35 * i, "tick", { note: N.B6, label: "fork" }); add(19.9 + 0.3 * i, "tick", { note: N.D6, label: "desk" }); }
      add(13.0, "scan", { label: "time travel" });
      add(24.6, "click", { label: "change set" }); add(27.0, "check", { label: "merged" }); add(28.0, "conflict", { label: "conflict as data" });
      add(31.2, "pop", { note: N.A4, label: "model" });
      for (let i = 0; i < 4; i++) { add(37.8 + 0.3 * i + 0.9, "tink", { note: [N.D6, N.Fs6, N.A6, N.B6][i], label: "payout" }); }
      add(39.9, "thunk", { label: "rejected, not paid" });
    } else {
      for (let a = 0; a < 100; a += 3) add(0.4 + 0.045 * ((a % 10) + Math.floor(a / 10)) + 0.3, "tick", { note: [N.D6, N.Fs6, N.A6][a % 3], label: "mosaic" });
      [4.4, 5.5, 6.6].forEach((t, i) => add(t, "bell", { note: [N.Fs4, N.A4, N.D5][i], label: "hero line" }));
      add(9.4, "chime", { label: "built on Cloudflare" }); add(10.6, "check", { label: "open source" });
      add(11.2, "bell", { note: N.D4, label: "final" });
    }
    return c.sort((a, b) => a.t - b.t);
  }

  async function buildAudio({ bed = true, cues = true, sr = 48000 } = {}) {
    const total = TL.dur + 1.0;
    const oc = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    const R = rng(20261013);
    // seeded noise
    const nb = oc.createBuffer(1, sr * 2, sr); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = R() * 2 - 1;
    const comp = oc.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    const out = oc.createGain(); out.gain.value = 0.9; comp.connect(out); out.connect(oc.destination);
    const bedBus = oc.createGain(); bedBus.connect(comp);
    const cueBus = oc.createGain(); cueBus.gain.value = 1.0; cueBus.connect(comp);
    // bed intensity over the story (soft in the Question, fullest in Proof and Payoff)
    const D = TL.dur, SEGN = TL.seg;
    const I = SEGN === "open" ? [[0, 0.45], [3.4, 0.6], [8, 0.8], [15, 1.0], [46, 1.0], [82, 0.9], [D, 0.0]] : SEGN === "hood" ? [[0, 0.7], [4, 0.9], [D - 2, 0.9], [D, 0.0]] : [[0, 0.8], [4, 1.0], [D - 3, 1.0], [D, 0.0]];
    bedBus.gain.setValueAtTime(I[0][1], 0);
    for (const [t, v] of I.slice(1)) bedBus.gain.linearRampToValueAtTime(v, t);

    function env(gn, t, a, d, peak, sustain = 0) {
      gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(peak, t + a);
      gn.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
    }
    function tone(t, f, d, { type = "sine", gain = 0.1, a = 0.005, lp = 0, dest = cueBus, glideTo = 0, detune = 0 } = {}) {
      const o = oc.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + d); o.detune.value = detune;
      const gn = oc.createGain(); env(gn, t, a, d, gain);
      let node = o; o.connect(gn); node = gn;
      if (lp) { const fl = oc.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lp; gn.connect(fl); node = fl; }
      node.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
    }
    function noise(t, d, { f0 = 800, f1 = 0, q = 1, gain = 0.05, type = "bandpass", a = 0.01, dest = cueBus } = {}) {
      const s = oc.createBufferSource(); s.buffer = nb; s.loop = true;
      const fl = oc.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + d);
      const gn = oc.createGain(); env(gn, t, a, d, gain);
      s.connect(fl); fl.connect(gn); gn.connect(dest); s.start(t, R() * 1.5); s.stop(t + a + d + 0.05);
    }
    // cue voices (soft, short, no clipping transients)
    const V = {
      tock: (c) => { tone(c.t, hz(c.note), 0.28, { type: "triangle", gain: 0.11, lp: 1800 }); tone(c.t, hz(c.note - 12), 0.12, { gain: 0.08 }); },
      task: (c) => { tone(c.t, hz(c.note), 0.16, { type: "triangle", gain: 0.05, lp: 1800 }); },
      thud: (c) => { const k = c.soft ? 0.6 : 1; tone(c.t, 92, 0.38, { type: "sawtooth", gain: 0.1 * k, lp: 260 }); tone(c.t, 97.5, 0.38, { type: "sawtooth", gain: 0.08 * k, lp: 260 }); noise(c.t, 0.18, { f0: 420, q: 0.8, gain: 0.06 * k }); },
      swoosh: (c) => noise(c.t, c.soft ? 0.5 : 1.2, { f0: 300, f1: 2200, q: 0.9, gain: c.soft ? 0.025 : 0.06, a: c.soft ? 0.12 : 0.4 }),
      whoosh: (c) => noise(c.t, 0.55, { f0: 600, f1: 1500, q: 1.2, gain: 0.022, a: 0.15 }),
      scan: (c) => noise(c.t, 0.35, { f0: 900, f1: 2600, q: 3, gain: 0.02, a: 0.1 }),
      click: (c) => { tone(c.t, 1800, 0.02, { gain: 0.07 }); tone(c.t, 900, 0.07, { type: "triangle", gain: 0.08 }); },
      tick: (c) => tone(c.t, hz(c.note), 0.07, { gain: 0.035 }),
      pop: (c) => tone(c.t, hz(c.note), 0.18, { type: "triangle", gain: 0.07, lp: 2400 }),
      chime: (c) => { tone(c.t, hz(N.A4), 0.5, { gain: 0.06 }); tone(c.t + 0.1, hz(N.D5), 0.7, { gain: 0.06 }); },
      check: (c) => { tone(c.t, hz(N.E4), 0.1, { gain: 0.045 }); tone(c.t + 0.09, hz(N.B4), 0.22, { gain: 0.05 }); },
      conflict: (c) => { tone(c.t, hz(N.D3), 0.7, { type: "triangle", gain: 0.06, lp: 900 }); tone(c.t, hz(N.Eb3), 0.7, { type: "triangle", gain: 0.05, lp: 900 }); },
      rise: (c) => { tone(c.t, hz(N.D4), 0.5, { type: "triangle", gain: 0.05, glideTo: hz(N.A4), lp: 2000 }); },
      glide: (c) => tone(c.t, 300, 1.4, { gain: 0.03, glideTo: 620, a: 0.3 }),
      tink: (c) => { tone(c.t, hz(c.note), 0.3, { gain: 0.04 }); tone(c.t, hz(c.note) * 1.5, 0.18, { gain: 0.015 }); },
      thunk: (c) => tone(c.t, 330, 0.18, { type: "triangle", gain: 0.05, glideTo: 200, lp: 1200 }),
      bell: (c) => { tone(c.t, hz(c.note), 1.6, { gain: 0.08, a: 0.01 }); tone(c.t, hz(c.note) * 2.0, 0.8, { gain: 0.025 }); tone(c.t, hz(c.note) * 3.01, 0.4, { gain: 0.012 }); }
    };
    if (cues) for (const c of cueList()) V[c.type](c);

    if (bed) {
      const chords = [[N.D3, N.Fs3, N.A3, N.Cs4], [N.B2, N.D3, N.Fs3, N.A3], [N.G2, N.B2, N.D3, N.Fs3], [N.A2, N.E3, N.A3, N.Cs4]];
      const bar = BEAT * 4, step = bar * 2;                        // a chord every two bars = 5 s
      for (let c = 0, t = 0; t < TL.dur + 2; c++, t += step) {
        const ch = chords[c % 4];
        const end = Math.min(t + step + 0.8, TL.dur + 0.8);
        for (const n of ch) for (const dt of [-3, 3]) {            // pad: two detuned triangles per note, slow swell
          const o = oc.createOscillator(); o.type = "triangle"; o.frequency.value = hz(n); o.detune.value = dt;
          const gn = oc.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(0.022, t + 1.4); gn.gain.setValueAtTime(0.022, Math.max(t + 1.4, end - 1.4)); gn.gain.linearRampToValueAtTime(0.0001, end);
          const fl = oc.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 900; o.connect(gn); gn.connect(fl); fl.connect(bedBus); o.start(t); o.stop(end + 0.05);
        }
        // arpeggio plucks, from the Model scenes to the turn
        const pat = [0, 2, 1, 3, 2, 1, 3, 2];
        for (let k = 0; k < 16; k++) {
          const tt = t + k * BEAT / 2;
          if (tt < (TL.seg === "open" ? 15 : TL.seg === "hood" ? 3.9 : 0) || tt > TL.dur - 1.5) continue;
          const sparse = TL.seg === "open" && tt > 70 && tt < 76 ? k % 2 === 1 : false;      // thin out under 'No.'
          if (sparse) continue;
          const n = ch[pat[k % 8] % 4] + 12;
          tone(tt, hz(n), 0.4, { type: "triangle", gain: 0.02, lp: 2600, dest: bedBus });
        }
      }
      // pulse: beats 1 and 3 from the Model, every beat from the goal
      for (let b = 0; b * BEAT < TL.dur; b++) {
        const t = b * BEAT;
        if (t < (TL.seg === "open" ? 8 : TL.seg === "hood" ? 3.9 : 99) || t > TL.dur - 2) continue;
        if (TL.seg === "open" && t < 15 && b % 2 !== 0) continue;
        tone(t, 72, 0.22, { gain: 0.1, glideTo: 46, dest: bedBus });
      }
      // motif returns on the key ideas: one repo per agent, the résumé line
      for (const t0 of (TL.seg === "open" ? [8.2, 33.4, 61.0] : TL.seg === "close" ? [4.4] : [])) [N.Fs4, N.A4, N.B4, N.D5].forEach((n, j) => {
        const t = t0 + j * BEAT / 2;
        tone(t, hz(n), 1.4, { gain: 0.07, dest: bedBus }); tone(t, hz(n) * 2, 0.7, { gain: 0.02, dest: bedBus });
      });
      // final swell under the payoff, then out
      for (const n of [N.D3, N.A3, N.D4, N.Fs4]) {
        const o = oc.createOscillator(); o.type = "triangle"; o.frequency.value = hz(n);
        const gn = oc.createGain(); const t = Math.max(0, TL.dur - 6);
        gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(0.04, t + 1.5); gn.gain.setValueAtTime(0.04, TL.dur - 2.5); gn.gain.linearRampToValueAtTime(0.0001, TL.dur);
        const fl = oc.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 1200; o.connect(gn); gn.connect(fl); fl.connect(bedBus); o.start(t); o.stop(TL.dur + 0.2);
      }
    }
    return oc.startRendering();
  }

  function toWav(buf) {
    const ch = buf.numberOfChannels, n = Math.min(buf.length, Math.round(TL.dur * buf.sampleRate)), sr = buf.sampleRate;
    const ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * ch * 2, true);
    const d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, d[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    let bin = ""; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  g.buildAudio = buildAudio; g.audioToWavBase64 = toWav; g.cueList = cueList;
})(typeof window !== "undefined" ? window : globalThis);
