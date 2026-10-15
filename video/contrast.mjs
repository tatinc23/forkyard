import fs from "node:fs";
await import("./tokens.js"); const T = globalThis.TOKENS;
const c = T.color;
const lum = h => { const [r,g,b] = [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255).map(v => v<=0.03928? v/12.92 : ((v+0.055)/1.055)**2.4); return 0.2126*r+0.7152*g+0.0722*b; };
const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const pairs = [
  ["ink on paper (headline, labels)", c.ink, c.paper, 4.5],
  ["muted on paper (sub, captions)", c.muted, c.paper, 4.5],
  ["muted on paper2 (panel text)", c.muted, c.paper2, 4.5],
  ["ink on paper2", c.ink, c.paper2, 4.5],
  ["orangeDeep on paper (accent text)", c.orangeDeep, c.paper, 4.5],
  ["orangeDeep on paper2", c.orangeDeep, c.paper2, 4.5],
  ["ink on orange (text inside orange blocks)", c.ink, c.orange, 4.5],
  ["ink on yellow", c.ink, c.yellow, 4.5],
  ["ink on sand", c.ink, c.sand, 4.5],
  ["paper on ink (button label)", c.paper, c.ink, 4.5],
  ["orange vs paper (shape alone, non-text >= 3:1)", c.orange, c.paper, 3, "FAILS alone: every orange/yellow shape gets a 3px ink edge (ink vs orange below)"],
  ["yellow vs paper (shape alone)", c.yellow, c.paper, 3, "FAILS alone: same 3px ink edge rule"],
  ["ink vs orange (shape edge)", c.ink, c.orange, 3],
  ["line vs paper (hairline, decorative)", c.line, c.paper, 1],
];
const out = pairs.map(([n,a,b,min,note]) => ({ pair:n, fg:a, bg:b, ratio:+ratio(a,b).toFixed(2), min, pass: ratio(a,b) >= min, ...(note?{note}:{}) }));
fs.mkdirSync("verify", { recursive: true });
fs.writeFileSync("verify/contrast.json", JSON.stringify(out, null, 2));
for (const o of out) console.log((o.pass?"PASS":"FAIL"), String(o.ratio).padStart(5), "(min "+o.min+")", o.pair, o.note?"  -> "+o.note:"");
