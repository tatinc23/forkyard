import { useCallback, useEffect, useRef, useState } from "react";
import { BEAT, BEATS, TOTAL, paintScene } from "./scene";
import { PINS } from "../../lib/config";
import { fetchEvents } from "../../lib/api";

type Beat = { tab: string; caption: string; gh: string; fy: string; side: "gh" | "fy" };

/** The words are the spec's: section 2 of docs/superpowers/specs/2026-10-14-forkyard-design.md. */
const BEAT_INFO: Beat[] = [
	{ tab: "GitHub today", caption: "GitHub: a branch per person, one merge at a time", gh: "a branch per person", fy: "a fork per agent", side: "gh" },
	{ tab: "A fork per agent", caption: "Forkyard: a fork per agent", gh: "a branch per person", fy: "a fork per agent", side: "fy" },
	{ tab: "A merge tree", caption: "A merge tree, not a queue", gh: "one merge at a time", fy: "a merge tree", side: "fy" },
	{ tab: "Review by exception", caption: "Review by exception", gh: "read every diff", fy: "only what needs you", side: "fy" },
];

const IDEAS = [
	{ title: "A fork per agent", gh: "a branch per person", body: "Every agent works in its own Artifacts fork with a write key that expires with its contract. Nobody shares a branch, so nobody waits." },
	{ title: "A merge tree, not a queue", gh: "one merge at a time", body: "Crews merge in parallel into crew lines; crew lines merge into main. Conflicts come back as data, and the agent that caused one fixes it.", note: "By design, 100 agents is 2 levels and 100,000 agents is 5 levels of 10." },
	{ title: "Review by exception", gh: "read every diff", body: "The Inspector checks every delivery. You see only what needs a human, as a live before and after of the real site." },
];

function useReducedMotion() {
	const [r, setR] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
	useEffect(() => {
		const m = matchMedia("(prefers-reduced-motion: reduce)");
		const on = () => setR(m.matches);
		m.addEventListener("change", on);
		return () => m.removeEventListener("change", on);
	}, []);
	return r;
}

/** Keeps a canvas sharp at the device pixel ratio and reports its CSS size. Desktop is wide; phones get a taller frame. */
function useCanvasBox(repaint: (ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) => void) {
	const wrap = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const size = useRef({ w: 0, h: 0, dpr: 1 });
	const paintRef = useRef(repaint);
	paintRef.current = repaint;
	const redraw = useCallback(() => {
		const c = canvas.current;
		const ctx = c?.getContext("2d");
		if (!c || !ctx || !size.current.w) return;
		paintRef.current(ctx, size.current.w, size.current.h, size.current.dpr);
	}, []);
	useEffect(() => {
		const el = wrap.current;
		const c = canvas.current;
		if (!el || !c) return;
		const fit = () => {
			const w = Math.round(el.clientWidth);
			if (!w) return;
			const h = Math.round(w / (w >= 520 ? 2.1 : 1.3));
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			c.width = Math.round(w * dpr);
			c.height = Math.round(h * dpr);
			c.style.height = `${h}px`;
			size.current = { w, h, dpr };
			redraw();
		};
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		fit();
		document.fonts?.ready.then(redraw).catch(() => undefined);
		return () => ro.disconnect();
	}, [redraw]);
	return { wrap, canvas, redraw };
}

function Chip({ b }: { b: Beat }) {
	return (
		<p className="vs" aria-label={`GitHub: ${b.gh}. Forkyard: ${b.fy}.`}>
			<span className={`vs-cell gh ${b.side === "gh" ? "on" : ""}`}>
				<b>GitHub</b> {b.gh}
			</span>
			<span className="vs-arrow" aria-hidden="true">
				→
			</span>
			<span className={`vs-cell fy ${b.side === "fy" ? "on" : ""}`}>
				<b>Forkyard</b> {b.fy}
			</span>
		</p>
	);
}

function Stage() {
	const [beat, setBeat] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [visible, setVisible] = useState(true);
	const t = useRef(0);
	const beatRef = useRef(0);
	const root = useRef<HTMLElement>(null);
	const { wrap, canvas, redraw } = useCanvasBox((ctx, w, h, dpr) => paintScene(ctx, w, h, dpr, t.current));

	useEffect(() => {
		const el = root.current;
		if (!el) return;
		const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (!playing || !visible) return;
		let raf = 0;
		let last = performance.now();
		const loop = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (!document.hidden) {
				t.current = (t.current + dt) % TOTAL;
				redraw();
				const b = Math.floor(t.current / BEAT);
				root.current?.style.setProperty("--u", String((t.current - b * BEAT) / BEAT));
				if (b !== beatRef.current) {
					beatRef.current = b;
					setBeat(b);
				}
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [playing, visible, redraw]);

	const jump = (b: number) => {
		t.current = b * BEAT + 0.02;
		beatRef.current = b;
		setBeat(b);
		root.current?.style.setProperty("--u", "0");
		redraw();
	};
	const info = BEAT_INFO[Math.min(BEATS - 1, Math.max(0, beat))];

	return (
		<figure className="stage" ref={root} data-beat={beat} aria-label="How Forkyard differs from GitHub, in four steps">
			<div className="stage-top">
				<Chip b={info} />
				<button className="stage-play" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing} aria-label={playing ? "Pause the animation" : "Play the animation"}>
					{playing ? (
						<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
							<path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" fill="currentColor" />
						</svg>
					) : (
						<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
							<path d="M3 1.5v9l7-4.5z" fill="currentColor" />
						</svg>
					)}
					<span>{playing ? "Pause" : "Play"}</span>
				</button>
			</div>
			<div className="stage-canvas" ref={wrap}>
				<canvas ref={canvas} role="img" aria-label={info.caption} />
			</div>
			<figcaption className="stage-cap" key={beat}>
				{info.caption}
			</figcaption>
			<ol className="beats" aria-label="Jump to a step">
				{BEAT_INFO.map((b, i) => (
					<li key={b.tab}>
						<button className="beat" aria-current={i === beat ? "step" : undefined} onClick={() => jump(i)}>
							<span className="beat-n" aria-hidden="true">
								{i + 1}
							</span>
							<span>{b.tab}</span>
							<i aria-hidden="true" />
						</button>
					</li>
				))}
			</ol>
		</figure>
	);
}

function StaticFrame({ i }: { i: number }) {
	const { wrap, canvas } = useCanvasBox((ctx, w, h, dpr) => paintScene(ctx, w, h, dpr, i * BEAT + BEAT * 0.96));
	const b = BEAT_INFO[i];
	return (
		<figure className="still">
			<div className="stage-canvas" ref={wrap}>
				<canvas ref={canvas} role="img" aria-label={b.caption} />
			</div>
			<Chip b={b} />
			<figcaption className="stage-cap">{b.caption}</figcaption>
		</figure>
	);
}

/** Real numbers from the pinned 100-agent run, shown only once its job id is set. Nothing here is invented. */
function ScaleFacts() {
	const [facts, setFacts] = useState<{ label: string; value: string }[] | null>(null);
	useEffect(() => {
		if (!PINS.scale) return;
		let dead = false;
		fetchEvents(PINS.scale)
			.then((evs) => {
				const done = (evs as unknown as Record<string, unknown>[]).find((e) => e.type === "scale_done");
				if (!done || dead) return;
				const n = (k: string) => (typeof done[k] === "number" ? (done[k] as number) : null);
				const out: { label: string; value: string }[] = [];
				const add = (label: string, v: number | null, fmt = (x: number) => String(x)) => v != null && out.push({ label, value: fmt(v) });
				add("agents", n("agents"));
				add("forks", n("forks"));
				add("commits", n("commits"));
				add("conflicts", n("conflicts"));
				add("resolved", n("resolved"));
				add("to merge everything", n("ms"), (ms) => `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`);
				if (out.length) setFacts(out);
			})
			.catch(() => undefined);
		return () => {
			dead = true;
		};
	}, []);
	if (!PINS.scale || !facts) return null;
	return (
		<dl className="facts-run" aria-label="Numbers from the recorded 100-agent run">
			{facts.map((f) => (
				<div key={f.label}>
					<dt>{f.label}</dt>
					<dd className="num">{f.value}</dd>
				</div>
			))}
			<p className="hint">From the recorded 100-agent run, job {PINS.scale}.</p>
		</dl>
	);
}

export function Hero({ onWatch, onFilm, watching }: { onWatch: (which: "crew" | "scale") => void; onFilm: () => void; watching: boolean }) {
	const reduced = useReducedMotion();
	return (
		<section className="fy-hero" aria-labelledby="hero-title">
			<div className="wrap">
				<div className="fy-top">
					<div className="fy-copy">
						<p className="fy-eyebrow">
							<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
								<path d="M8 14V8M8 8L3.5 3M8 8l4.5-5M8 8V2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
							</svg>
							Source control for agent crews
						</p>
						<h1 id="hero-title" className="fy-title">
							<span>One repo.</span> <span>A hundred agents.</span> <span>All at once.</span>
						</h1>
						<p className="fy-sub">GitHub gives each person a branch and a pull request, and changes land one at a time. Forkyard gives every agent its own fork and a contract, merges their work as a tree instead of a queue, and shows you only what needs a human. Built on Cloudflare Workers and Artifacts.</p>
						<div className="fy-cta">
							<button className="btn orange big" onClick={() => onWatch("scale")} disabled={watching}>
								{watching ? "Loading the recording" : "Watch 100 agents"}
							</button>
							<button className="btn ghost big" onClick={() => onWatch("crew")} disabled={watching}>
								Watch an AI crew
							</button>
							<button className="btn-text" onClick={onFilm}>
								<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
									<path d="M4 2.5v11l9-5.5z" fill="currentColor" />
								</svg>
								Watch the film
							</button>
						</div>
					</div>
					<div className="fy-stage">
						{reduced ? (
							<div className="stills">
								{Array.from({ length: BEATS }, (_, i) => (
									<StaticFrame key={i} i={i} />
								))}
							</div>
						) : (
							<Stage />
						)}
						<ScaleFacts />
					</div>
				</div>
				<ul className="ideas">
					{IDEAS.map((d) => (
						<li key={d.title}>
							<h2>{d.title}</h2>
							<p className="idea-gh">
								<b>GitHub</b> {d.gh}
							</p>
							<p>{d.body}</p>
							{d.note && <p className="hint">{d.note}</p>}
						</li>
					))}
				</ul>
				<p className="fy-wage">
					<b>Paid only if it merges.</b> Contracts carry a wage, reputation comes from git outcomes, and payouts settle over x402.
				</p>
			</div>
		</section>
	);
}
