/**
 * The landing scene: a pure painter. Every frame is a function of time T only (seconds, 0 to TOTAL), so the same
 * code draws the looping animation, the four reduced-motion stills and any frame a reviewer wants to inspect.
 *
 * Four beats, one idea each (Question, Model, Proof, Turn, Payoff compressed to a loop):
 *   0  GitHub today     one lane, a queue of PRs, one merge at a time
 *   1  A fork per agent main fans out into 100 agents, all working at once
 *   2  A merge tree     groups of 10 merge into 10 crew lines, crew lines merge into main
 *   3  Review by exception  3 agents flagged "needs you", the other 97 auto-approved (an illustration, not run data)
 *
 * Shape carries meaning as well as colour: waiting = dashed outline, working = hollow dot, approved = tick,
 * needs you = diamond with a ring and a text label.
 */
export const BEAT = 2.75;
export const BEATS = 4;
export const TOTAL = BEAT * BEATS;

const INK = "#0F1826";
const PAPER = "#F7F8F9";
const ORANGE = "#F6821F";
const ORANGE_INK = "#9A3D00";
const LINE = "#B3BAC5";
const MUTED = "#535E72";
const OK = "#17703F";
const FONT = '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif';

export const FLAGGED = new Set([23, 58, 91]);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeInOut = (x: number) => {
	const t = clamp01(x);
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

type Geo = { w: number; h: number; mx: number; my: number; r: number; s: number; gx0: number; gx1: number; crewX: number; busX: number; rowY: (c: number) => number; dot: (i: number) => [number, number] };

function geo(w: number, h: number): Geo {
	const s = Math.min(1.25, Math.max(0.62, Math.min(w / 700, h / 330)));
	const gx0 = w * 0.5;
	const gx1 = w * 0.93;
	const rowY = (c: number) => h * (0.115 + (c * 0.77) / 9);
	const sx = (gx1 - gx0) / 9;
	const sy = (h * 0.77) / 9;
	const r = Math.min(7, Math.max(2.6, Math.min(sx, sy) * 0.3));
	return {
		w, h, s, r, gx0, gx1,
		mx: w * 0.07,
		my: h * 0.5,
		crewX: w * 0.33,
		busX: w * 0.2,
		rowY,
		dot: (i) => [gx0 + (i % 10) * sx, rowY(Math.floor(i / 10))],
	};
}

function txt(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = "left") {
	ctx.font = `${weight} ${size}px ${FONT}`;
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.textBaseline = "alphabetic";
	ctx.fillText(s, x, y);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, lw: number) {
	ctx.strokeStyle = color;
	ctx.lineWidth = lw;
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | null, stroke: string | null, lw: number) {
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	if (fill) {
		ctx.fillStyle = fill;
		ctx.fill();
	}
	if (stroke) {
		ctx.strokeStyle = stroke;
		ctx.lineWidth = lw;
		ctx.stroke();
	}
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string, lw: number) {
	ctx.beginPath();
	ctx.moveTo(x, y - r);
	ctx.lineTo(x + r, y);
	ctx.lineTo(x, y + r);
	ctx.lineTo(x - r, y);
	ctx.closePath();
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.strokeStyle = stroke;
	ctx.lineWidth = lw;
	ctx.stroke();
}

/** A working agent: a hollow dot with an ink edge and an orange core. */
function agentDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, G: Geo) {
	circle(ctx, x, y, r, ORANGE, INK, Math.max(1.2, 1.5 * G.s));
}

function tick(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, G: Geo) {
	circle(ctx, x, y, r, OK, null, 0);
	if (r >= 3.4) {
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = Math.max(1.1, r * 0.3);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.beginPath();
		ctx.moveTo(x - r * 0.45, y + r * 0.02);
		ctx.lineTo(x - r * 0.1, y + r * 0.38);
		ctx.lineTo(x + r * 0.5, y - r * 0.32);
		ctx.stroke();
		ctx.lineCap = "butt";
	}
	void G;
}

function mainNode(ctx: CanvasRenderingContext2D, G: Geo, grow: number) {
	const R = 11 * G.s;
	if (grow > 0) circle(ctx, G.mx, G.my, R + grow * 9 * G.s, null, ORANGE, 3 * G.s);
	circle(ctx, G.mx, G.my, R, INK, null, 0);
	txt(ctx, "main", G.mx, G.my + R + 15 * G.s, 12.5 * G.s, 650, INK, "center");
}

// ---------- beat 0: GitHub, one lane and a queue ----------

const MERGE_AT = [0.35, 1.45];
const MERGE_DUR = 0.9;

function beatQueue(ctx: CanvasRenderingContext2D, G: Geo, u: number, a: number) {
	const { w, h, mx, my, s } = G;
	const gateX = w * 0.25;
	const tw = Math.min(46, Math.max(20, w * 0.066));
	const th = tw * 0.78;
	const pitch = tw + w * 0.018;
	const slot = (q: number) => w * 0.36 + q * pitch;
	const laneSlot = (j: number) => w * 0.115 + j * Math.max(11, w * 0.028);
	ctx.save();
	ctx.globalAlpha *= a;
	line(ctx, mx, my, w * 0.95, my, LINE, 2.2 * s);
	// the gate: only one thing passes at a time
	line(ctx, gateX, my - h * 0.17, gateX, my + h * 0.17, INK, 3.5 * s);
	txt(ctx, "one merge at a time", gateX, my + h * 0.17 + 16 * s, 12 * s, 600, INK, "center");

	const f = MERGE_AT.reduce((n, a0) => n + easeInOut((u - (a0 + MERGE_DUR)) / 0.2), 0);
	for (let j = 7; j >= 0; j--) {
		let x = slot(j - f);
		let fill: string | null = PAPER;
		let merging = false;
		let width = tw;
		if (j < 2) {
			const a0 = MERGE_AT[j];
			if (u >= a0 && u < a0 + MERGE_DUR) {
				const p = (u - a0) / MERGE_DUR;
				const gateStop = gateX + tw * 0.9;
				if (p < 0.42) x = lerp(slot(0), gateStop, easeInOut(p / 0.42));
				else if (p < 0.58) x = gateStop;
				else x = lerp(gateStop, laneSlot(j), easeInOut((p - 0.58) / 0.42));
				width = lerp(tw, 2 * 7 * s, easeInOut((p - 0.58) / 0.42));
				merging = true;
			} else if (u >= a0 + MERGE_DUR) {
				x = laneSlot(j);
				width = 2 * 7 * s;
				merging = true;
			}
		}
		const y = my;
		ctx.beginPath();
		ctx.roundRect(x - width / 2, y - th / 2, width, th, Math.min(th / 2, 5 * s));
		if (merging) {
			fill = INK;
			ctx.setLineDash([]);
		} else ctx.setLineDash([4 * s, 3 * s]);
		ctx.fillStyle = fill ?? PAPER;
		ctx.fill();
		ctx.strokeStyle = INK;
		ctx.lineWidth = 1.6 * s;
		ctx.stroke();
		ctx.setLineDash([]);
		if (!merging && tw >= 24) txt(ctx, "PR", x, y + 4 * s, 11 * s, 650, MUTED, "center");
	}
	txt(ctx, "waiting for their turn", slot(3.5), my - th / 2 - 12 * s, 12 * s, 600, MUTED, "center");
	ctx.restore();
}

// ---------- beat 1: a fork per agent ----------

function beatFan(ctx: CanvasRenderingContext2D, G: Geo, u: number, lineAlpha: number, labels = true) {
	const { mx, my, r, s } = G;
	let landed = 0;
	const items: { x: number; y: number; rr: number; i: number }[] = [];
	for (let i = 0; i < 100; i++) {
		const c = Math.floor(i / 10);
		const k = i % 10;
		const tb = 0.1 + c * 0.09 + k * 0.012;
		const p = easeOut((u - tb) / 0.75);
		if (p <= 0) continue;
		const [tx, ty] = G.dot(i);
		const x = lerp(mx, tx, p);
		const y = lerp(my, ty, p);
		if (p >= 0.999) landed++;
		if (lineAlpha > 0) {
			ctx.globalAlpha = 0.2 * lineAlpha;
			line(ctx, mx, my, x, y, INK, Math.max(0.8, 0.9 * s));
			ctx.globalAlpha = 1;
		}
		items.push({ x, y, rr: r * (0.35 + 0.65 * p) * (1 + (p >= 0.999 ? 0.07 * Math.sin(u * 5 + i) : 0)), i });
	}
	for (const d of items) agentDot(ctx, d.x, d.y, d.rr, G);
	if (labels) txt(ctx, `${landed} forks`, G.gx1 + r, G.h * 0.05, 12.5 * s, 650, INK, "right");
}

/** The thin fork lines from main to every agent, without the dots (they melt away as the tree appears). */
function rays(ctx: CanvasRenderingContext2D, G: Geo, alpha: number) {
	const base = ctx.globalAlpha;
	ctx.globalAlpha = base * 0.2 * alpha;
	for (let i = 0; i < 100; i++) {
		const [x, y] = G.dot(i);
		line(ctx, G.mx, G.my, x, y, INK, Math.max(0.8, 0.9 * G.s));
	}
	ctx.globalAlpha = base;
}

// ---------- beat 2: merge tree ----------

function beatTree(ctx: CanvasRenderingContext2D, G: Geo, u: number): number {
	const { mx, my, r, s, crewX, busX } = G;
	const a = easeOut(u / 0.3);
	const side = r * 1.25;
	ctx.save();
	// connectors: crew line -> bus -> main
	ctx.globalAlpha = a * 0.7;
	for (let c = 0; c < 10; c++) {
		const y = G.rowY(c);
		line(ctx, crewX, y, busX, y, INK, 1.6 * s);
		line(ctx, G.gx0 - r * 1.8, y, crewX, y, LINE, 1 * s); // row guide, agent to crew line
	}
	line(ctx, busX, G.rowY(0), busX, G.rowY(9), INK, 1.6 * s);
	line(ctx, busX, my, mx, my, INK, 1.6 * s);
	ctx.globalAlpha = 1;

	// agents slide into their crew line, all ten crews in parallel
	const arrived: number[] = new Array(10).fill(0);
	for (let i = 0; i < 100; i++) {
		const c = Math.floor(i / 10);
		const k = i % 10;
		const d = 0.35 + c * 0.04 + k * 0.07;
		const p = easeInOut((u - d) / 0.55);
		const [tx, ty] = G.dot(i);
		if (p >= 1) {
			arrived[c]++;
			continue;
		}
		ctx.globalAlpha = p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15;
		agentDot(ctx, lerp(tx, crewX, p), ty, r, G);
		ctx.globalAlpha = 1;
	}
	// crew lines fill up as members merge in, then send themselves to main
	let reached = 0;
	for (let c = 0; c < 10; c++) {
		const y = G.rowY(c);
		const fillP = arrived[c] / 10;
		ctx.beginPath();
		ctx.rect(crewX - side, y - side, side * 2, side * 2);
		ctx.fillStyle = PAPER;
		ctx.fill();
		ctx.globalAlpha = 0.25 + 0.75 * fillP;
		ctx.fillStyle = ORANGE;
		ctx.fillRect(crewX - side, y - side, side * 2, side * 2);
		ctx.globalAlpha = 1;
		ctx.strokeStyle = INK;
		ctx.lineWidth = 1.8 * s;
		ctx.strokeRect(crewX - side, y - side, side * 2, side * 2);
		const ps = 1.4 + c * 0.03;
		const p = easeInOut((u - ps) / 0.6);
		if (p > 0 && p < 1) {
			// travel crew -> bus -> main as one polyline
			const L1 = crewX - busX;
			const L2 = Math.abs(my - y);
			const L3 = busX - mx;
			let d = p * (L1 + L2 + L3);
			let px: number;
			let py: number;
			if (d <= L1) [px, py] = [crewX - d, y];
			else if ((d -= L1) <= L2) [px, py] = [busX, y + Math.sign(my - y || 1) * d];
			else [px, py] = [busX - (d - L2), my];
			circle(ctx, px, py, r * 1.1, ORANGE, INK, 1.5 * s);
		}
		if (p >= 1) reached++;
	}
	ctx.restore();
	txt(ctx, "100 agents", (G.gx0 + G.gx1) / 2, G.h * 0.05, 12.5 * s, 650, INK, "center");
	txt(ctx, "10 crew lines", crewX, G.h * 0.05, 12.5 * s, 650, INK, "center");
	return reached / 10;
}

// ---------- beat 3: review by exception ----------

function beatReview(ctx: CanvasRenderingContext2D, G: Geo, u: number) {
	const { r, s, h, w } = G;
	let ok = 0;
	let flagged = 0;
	const fade = easeOut(u / 0.25) * clamp01((BEAT - u) / 0.25);
	ctx.globalAlpha = fade;
	for (let i = 0; i < 100; i++) {
		const [x, y] = G.dot(i);
		const flip = 0.25 + i * 0.008;
		const isFlag = FLAGGED.has(i);
		if (u < flip) {
			circle(ctx, x, y, r, PAPER, INK, Math.max(1.2, 1.5 * s));
			continue;
		}
		if (isFlag) {
			flagged++;
			const pulse = 1 + 0.12 * Math.sin(u * 6);
			ctx.globalAlpha = fade;
			circle(ctx, x, y, r * 2.4 * pulse, null, ORANGE_INK, Math.max(1.4, 1.8 * s));
			diamond(ctx, x, y, r * 1.7, ORANGE, INK, Math.max(1.4, 2 * s));
			const left = i % 10 >= 6;
			const label = "needs you";
			ctx.lineJoin = "round";
			ctx.font = `700 ${12 * s}px ${FONT}`;
			ctx.textAlign = left ? "right" : "left";
			const tx = x + (left ? -1 : 1) * (r * 2.9);
			const tw = ctx.measureText(label).width;
			const px = left ? tx - tw - 6 : tx - 6;
			ctx.fillStyle = PAPER;
			ctx.strokeStyle = ORANGE_INK;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(px, y - 9 * s, tw + 12, 18 * s, 6);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = INK;
			ctx.fillText(label, tx, y + 4 * s);
		} else {
			ok++;
			ctx.globalAlpha = fade * (u > 1.3 ? lerp(1, 0.55, easeOut((u - 1.3) / 0.4)) : 1);
			tick(ctx, x, y, r, G);
			ctx.globalAlpha = fade;
		}
	}
	ctx.globalAlpha = 1;
	// counters
	const x0 = w * 0.15;
	const big = Math.min(46, Math.max(28, h * 0.14));
	txt(ctx, String(ok), x0, h * 0.4, big, 760, OK);
	txt(ctx, "auto-approved", x0, h * 0.4 + 19 * s, 13.5 * s, 600, INK);
	txt(ctx, String(flagged), x0, h * 0.74, big, 760, ORANGE_INK);
	txt(ctx, "need you", x0, h * 0.74 + 19 * s, 13.5 * s, 600, INK);
}

/** Paint the frame at time T into a w x h CSS-pixel area. The caller owns canvas sizing and devicePixelRatio. */
export function paintScene(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, T: number) {
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, w, h);
	const G = geo(w, h);
	const t = ((T % TOTAL) + TOTAL) % TOTAL;
	const b = Math.min(BEATS - 1, Math.floor(t / BEAT));
	const u = t - b * BEAT;
	ctx.globalAlpha = Math.min(1, t / 0.25, (TOTAL - t) / 0.25);
	let grow = 0;
	if (b === 0) beatQueue(ctx, G, u, 1);
	if (b === 1) {
		beatQueue(ctx, G, BEAT, Math.max(0, 1 - u / 0.3));
		beatFan(ctx, G, u, 1);
	}
	if (b === 2) {
		// the rays from beat 1 melt away while the crew lines appear
		ctx.globalAlpha = Math.max(0, 1 - u / 0.3) * ctx.globalAlpha;
		rays(ctx, G, 1);
		ctx.globalAlpha = Math.min(1, t / 0.25, (TOTAL - t) / 0.25);
		grow = beatTree(ctx, G, u);
	}
	if (b === 3) beatReview(ctx, G, u);
	ctx.globalAlpha = Math.min(1, t / 0.25, (TOTAL - t) / 0.25);
	mainNode(ctx, G, b === 2 ? grow : 0);
	ctx.globalAlpha = 1;
}
