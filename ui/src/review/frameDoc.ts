/**
 * Review frames are fetched and handed to the iframe as `srcdoc` with a small prelude. A preview is served with a CSP
 * sandbox (opaque origin), so the parent can never reach into it; the prelude is the only way to (1) scroll both frames
 * in lock-step, (2) make animated pages comparable, (3) find what changed. It runs inside the same sandbox
 * (`allow-scripts`, no `allow-same-origin`) and talks to the parent with postMessage only.
 *
 * Determinism: Math.random is seeded, performance.now and requestAnimationFrame run on a fake 60 fps clock for a fixed
 * number of frames and then freeze, CSS animations/transitions jump to their end state. Two frames of the same code
 * therefore render the same pixels, so Blend / X-ray / Lens show real differences, not physics noise.
 */

export type DocSig = { k: string; t: number; b: number; l: number; r: number; p: number };
export type DocInfo = { h: number; sigs: DocSig[]; error?: string };

const PRELUDE = String.raw`(function(){
var seed=20261014;
Math.random=function(){seed=(seed+0x6D2B79F5)|0;var t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
var T=1000,STEP=1000/60,MAXF=240,frames=0,q=[],nid=0,started=false;
try{performance.now=function(){return T;};}catch(e){}
window.requestAnimationFrame=function(cb){q.push({id:++nid,cb:cb});return nid;};
window.cancelAnimationFrame=function(i){q=q.filter(function(x){return x.id!==i;});};
function root(){return document.scrollingElement||document.documentElement;}
function post(m){try{parent.postMessage(Object.assign({rv:1},m),'*');}catch(e){}}
function tick(){
  var n=0;
  while(n<8&&frames<MAXF){var cur=q;q=[];T+=STEP;frames++;n++;for(var i=0;i<cur.length;i++){try{cur[i].cb(T);}catch(e){}}}
  if(frames<MAXF)setTimeout(tick,0);else setTimeout(report,160);
}
var SKIP=/^(SCRIPT|STYLE|META|LINK|NOSCRIPT|BR|TEMPLATE|HEAD|TITLE|HTML|BASE)$/;
function report(){
  var sigs=[],map=new Map(),sy=root().scrollTop||0,sx=0;
  var els=document.body?document.body.getElementsByTagName('*'):[];
  for(var i=0;i<els.length&&sigs.length<2200;i++){
    var e=els[i];if(SKIP.test(e.tagName))continue;
    var r=e.getBoundingClientRect();if(r.width<6||r.height<6)continue;
    var cs=getComputedStyle(e);if(cs.visibility==='hidden'||cs.display==='none'||cs.opacity==='0')continue;
    var tx='';for(var c=e.firstChild;c;c=c.nextSibling){if(c.nodeType===3)tx+=c.nodeValue;}
    tx=tx.replace(/\s+/g,' ').trim().slice(0,40);
    var extra=e.tagName==='IMG'?(e.getAttribute('src')||''):'';
    var k=[e.tagName,e.id||'',tx,extra,Math.round(r.width/4),Math.round(r.height/4),Math.round((r.left+sx)/4),cs.backgroundColor,cs.color,cs.fontSize,cs.fontWeight,cs.borderRadius,cs.boxShadow==='none'?'':cs.boxShadow.slice(0,40),cs.backgroundImage==='none'?'':cs.backgroundImage.slice(0,50)].join('|');
    var p=-1;for(var a=e.parentElement;a;a=a.parentElement){if(map.has(a)){p=map.get(a);break;}}
    map.set(e,sigs.length);
    sigs.push({k:k,t:Math.round(r.top+sy),b:Math.round(r.bottom+sy),l:Math.round(r.left),r:Math.round(r.right),p:p});
  }
  post({kind:'ready',h:Math.max(root().scrollHeight,document.documentElement.scrollHeight),sigs:sigs});
}
window.addEventListener('message',function(e){var d=e.data;if(d&&d.rv===1&&d.kind==='scroll'){root().scrollTop=d.y;}});
function go(){if(started)return;started=true;setTimeout(tick,60);}
if(document.readyState==='complete')go();else window.addEventListener('load',go);
setTimeout(go,4000);
})();`;

const STYLE = `*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}html{scrollbar-width:none}::-webkit-scrollbar{display:none}`;

/** Wrap a fetched preview page: pin relative URLs to the preview path, keep the server's CSP, add the prelude. */
export function frameDoc(html: string, src: string): string {
	const abs = new URL(src, location.href);
	const origin = abs.origin;
	const dir = abs.href.replace(/[^/]*$/, "");
	const csp = `default-src 'unsafe-inline' ${origin} https://fonts.googleapis.com https://fonts.gstatic.com; img-src ${origin} data:`;
	const inject = `<base href="${dir}"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${STYLE}</style><script>${PRELUDE}</script>`;
	// Prepend, never splice into the agent's markup: a regex for <head> can be fooled (e.g. "<head>" inside a comment or
	// a script string), which would drop the CSP and prelude. Elements before <html> are parsed into the head, and our
	// doctype keeps standards mode; the agent's own doctype later is ignored.
	return `<!doctype html>${inject}${html.replace(/^\uFEFF?\s*<!doctype[^>]*>/i, "")}`;
}

/** Validate a `ready` message from a review frame (agent code runs in it, so its payload is untrusted). */
export function parseDocInfo(d: unknown): DocInfo | null {
	if (!d || typeof d !== "object") return null;
	const o = d as { h?: unknown; sigs?: unknown };
	const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
	const h = num(o.h, 0, 200000);
	if (h === null || !Array.isArray(o.sigs)) return null;
	const sigs: DocSig[] = [];
	for (const x of o.sigs.slice(0, 2200)) {
		if (!x || typeof x !== "object") continue;
		const r = x as Record<string, unknown>;
		const t = num(r.t, -1000, 200000), b = num(r.b, -1000, 200000), l = num(r.l, -10000, 10000), rr = num(r.r, -10000, 10000), p = num(r.p, -1, 2200);
		if (typeof r.k !== "string" || t === null || b === null || l === null || rr === null || p === null) continue;
		sigs.push({ k: r.k.slice(0, 600), t, b, l, r: rr, p });
	}
	return { h, sigs };
}

export type Region = { top: number; bottom: number; left: number; right: number; n: number; side: "after" | "before" };

/** Which regions of the page differ? Elements are matched by a style+text+size key (not position), so content pushed down by an insertion is not "changed". */
export function diffRegions(before: DocInfo | undefined, after: DocInfo | undefined): Region[] {
	if (!before || !after || before.error || after.error) return [];
	const flag = (a: DocSig[], b: DocSig[]) => {
		const pool = new Map<string, number>();
		for (const s of b) pool.set(s.k, (pool.get(s.k) ?? 0) + 1);
		const hit = a.map((s) => {
			const n = pool.get(s.k) ?? 0;
			if (n > 0) {
				pool.set(s.k, n - 1);
				return false;
			}
			return true;
		});
		const hasKid = new Set<number>();
		a.forEach((s, i) => {
			if (hit[i] && s.p >= 0) hasKid.add(s.p);
		});
		// keep the deepest changed elements; an ancestor that only grew because a child changed is not a change of its own
		return a.filter((_, i) => hit[i] && !hasKid.has(i));
	};
	const cluster = (items: DocSig[], side: Region["side"]): Region[] => {
		const sorted = items.filter((s) => (s.b - s.t) * (s.r - s.l) >= 120).sort((x, y) => x.t - y.t);
		const out: Region[] = [];
		for (const s of sorted) {
			const last = out[out.length - 1];
			if (last && s.t <= last.bottom + 110) {
				last.bottom = Math.max(last.bottom, s.b);
				last.left = Math.min(last.left, s.l);
				last.right = Math.max(last.right, s.r);
				last.n++;
			} else out.push({ top: s.t, bottom: s.b, left: s.l, right: s.r, n: 1, side });
		}
		return out;
	};
	const added = cluster(flag(after.sigs, before.sigs), "after");
	return added.length ? added : cluster(flag(before.sigs, after.sigs), "before");
}
