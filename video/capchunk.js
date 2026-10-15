// Shared (browser + node): fills {FACT.field} placeholders from facts.js and turns VO lines into caption cues.
// A cue is at most two lines of at most 54 characters; time inside a line is shared out in proportion to characters.
(function (g) {
  function fill(s) {
    return s.replace(/\{(\w+)\.(\w+)(:n)?\}/g, (m, a, b, n) => {
      const v = g.FACTS && g.FACTS[a] ? g.FACTS[a][b] : null;
      if (v === null || v === undefined) return "";
      return n ? Number(v).toLocaleString("en-US") : String(v);
    });
  }
  function wrap(s, max = 54) {
    if (s.length <= max) return s;
    const mid = s.length / 2; let best = -1;
    for (let i = 0; i < s.length; i++) if (s[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return s.slice(0, best) + "\n" + s.slice(best + 1);
  }
  function cuesForLine(line) {
    const text = fill(line.text).trim();
    const sents = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    const cues = []; let cur = "";
    for (const s of sents) {
      if (cur && (cur + " " + s).length > 108) { cues.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
    }
    if (cur) cues.push(cur);
    const out = []; for (const c of cues) { if (c.length > 108) { const i = c.indexOf(", ", c.length / 3); if (i > 0) { out.push(c.slice(0, i + 1)); out.push(c.slice(i + 2)); continue; } } out.push(c); }
    const total = out.reduce((n, c) => n + c.length, 0); let t = line.t; const dur = line.dur + 0.12; const res = [];
    for (const c of out) { const d = dur * c.length / total; res.push([+t.toFixed(3), +(t + d).toFixed(3), wrap(c)]); t += d; }
    return res;
  }
  function captionsFor(lines, seg) { return lines.filter((l) => l.seg === seg && l.t !== undefined).flatMap(cuesForLine); }
  g.CAPCHUNK = { fill, wrap, cuesForLine, captionsFor };
  if (typeof module !== "undefined") module.exports = g.CAPCHUNK;
})(typeof window !== "undefined" ? window : globalThis);
