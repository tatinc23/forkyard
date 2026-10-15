import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { diffRegions, frameDoc, parseDocInfo, type DocInfo } from "./frameDoc";
import { previewUrl, short } from "./helpers";

export type Stop = { key: string; label: string; story?: string; paths?: string[]; sha: string; on: string; color?: string; textColor?: string; final?: boolean };
type Mode = "lens" | "blend" | "xray";
type Device = "desktop" | "phone";

const LOGICAL = { desktop: { w: 1180, h: 740 }, phone: { w: 390, h: 800 } } as const;
const RAIL_W = 14;

/** One scaled, sandboxed iframe showing the site at a single commit (live URL: used where the page must be clickable). */
export function SiteFrame({ src, device, scale, title, interactive, onLoad, eager }: { src: string; device: Device; scale: number; title: string; interactive?: boolean; onLoad?: () => void; eager?: boolean }) {
	const L = LOGICAL[device];
	return (
		<iframe
			className="rv-frame"
			src={src}
			title={title}
			sandbox="allow-scripts"
			loading={eager ? "eager" : "lazy"}
			tabIndex={interactive ? 0 : -1}
			onLoad={onLoad}
			style={{ width: L.w, height: L.h, transform: `scale(${scale})`, pointerEvents: interactive ? "auto" : "none" }}
		/>
	);
}

/** A comparison frame: same sandbox, but loaded as srcdoc with the sync/settle prelude (see frameDoc.ts). */
function SyncFrame({ id, src, device, scale, title, reg, onDoc }: { id: string; src: string; device: Device; scale: number; title: string; reg: (id: string, el: HTMLIFrameElement | null) => void; onDoc: (id: string, d: DocInfo) => void }) {
	const L = LOGICAL[device];
	const [doc, setDoc] = useState<string | null>(null);
	useEffect(() => {
		const ctl = new AbortController();
		setDoc(null);
		fetch(src, { signal: ctl.signal })
			.then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status === 404 ? "This commit has no page to show." : `The preview answered ${r.status}.`))))
			.then((html) => setDoc(frameDoc(html, src)))
			.catch((e: unknown) => {
				if (!ctl.signal.aborted) onDoc(id, { h: 0, sigs: [], error: e instanceof Error ? e.message : "The preview did not load." });
			});
		return () => ctl.abort();
	}, [src, id, onDoc]);
	if (doc == null) return null;
	return (
		<iframe
			className="rv-frame"
			ref={(el) => reg(id, el)}
			srcDoc={doc}
			title={title}
			sandbox="allow-scripts"
			tabIndex={-1}
			style={{ width: L.w, height: L.h, transform: `scale(${scale})`, pointerEvents: "none" }}
		/>
	);
}

/** Measures an element's width. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
	const ref = useRef<T | null>(null);
	const [w, setW] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
		ro.observe(el);
		setW(Math.round(el.getBoundingClientRect().width));
		return () => ro.disconnect();
	}, []);
	return [ref, w];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function Compare({ jobId, beforeSha, stops, active, onActive, resetKey }: { jobId: string; beforeSha: string; stops: Stop[]; active: number; onActive: (i: number) => void; resetKey: string }) {
	const reduce = !!useReducedMotion();
	const [mode, setMode] = useState<Mode>("lens");
	const [device, setDevice] = useState<Device>(() => (typeof window !== "undefined" && window.innerWidth < 720 ? "phone" : "desktop"));
	const [tryIt, setTryIt] = useState(false);
	const [blend, setBlend] = useState(55);
	const [radius, setRadius] = useState(() => (typeof window !== "undefined" && window.innerWidth < 720 ? 120 : 190));
	const [seen, setSeen] = useState<Set<number>>(() => new Set([stops.length - 1]));
	const [docs, setDocs] = useState<Record<string, DocInfo>>({});
	const [giveUp, setGiveUp] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [sy, setSy] = useState(0);
	const [regionIdx, setRegionIdx] = useState(0);
	const [stageRef, cw] = useWidth<HTMLDivElement>();
	const boxRef = useRef<HTMLDivElement>(null);
	const frames = useRef(new Map<string, HTMLIFrameElement>());

	// a new chapter starts with a clean slate (ChapterView is keyed by chapter, this also covers a reused Compare)
	useEffect(() => {
		setSeen(new Set([stops.length - 1]));
		setDocs({});
		setGiveUp(false);
		setPlaying(false);
		setTryIt(false);
		setRegionIdx(0);
		scroll.current = { y: 0, ty: 0, raf: 0 };
		setSy(0);
		aimed.current = "";
	}, [resetKey, stops.length]); // eslint-disable-line react-hooks/exhaustive-deps

	// frames remount on a device change: forget what the old ones reported
	useEffect(() => {
		setDocs({});
		setGiveUp(false);
		aimed.current = "";
	}, [device]);

	useEffect(() => {
		setSeen((s) => (s.has(active) ? s : new Set(s).add(active)));
		setRegionIdx(0);
	}, [active]);

	// ---------- geometry ----------
	const L = LOGICAL[device];
	const maxH = typeof window !== "undefined" ? Math.max(380, window.innerHeight * 0.74) : 640;
	const avail = Math.max(120, cw - RAIL_W - 14);
	const scale = cw ? (device === "desktop" ? Math.min(avail / L.w, 1) : Math.min(avail / L.w, maxH / L.h, 1)) : 0.5;
	const bw = Math.round(L.w * scale);
	const bh = Math.round(L.h * scale);

	// ---------- frame registry, readiness, and the shared scroll position ----------
	const scroll = useRef({ y: 0, ty: 0, raf: 0 });
	const post = useCallback((el: HTMLIFrameElement | null | undefined, y: number) => {
		el?.contentWindow?.postMessage({ rv: 1, kind: "scroll", y: Math.round(y) }, "*");
	}, []);
	const reg = useCallback(
		(id: string, el: HTMLIFrameElement | null) => {
			if (el) frames.current.set(id, el);
			else frames.current.delete(id);
		},
		[],
	);
	const onDoc = useCallback((id: string, d: DocInfo) => setDocs((s) => ({ ...s, [id]: d })), []);

	useEffect(() => {
		const on = (e: MessageEvent) => {
			const d = e.data as { rv?: number; kind?: string } | null;
			if (!d || d.rv !== 1 || d.kind !== "ready") return;
			for (const [id, el] of frames.current) {
				if (el.contentWindow === e.source) {
					const info = parseDocInfo(d);
					if (!info) break;
					setDocs((s) => ({ ...s, [id]: info }));
					post(el, scroll.current.y); // a frame that opens late joins the current scroll position
					break;
				}
			}
		};
		window.addEventListener("message", on);
		return () => window.removeEventListener("message", on);
	}, [post]);

	useEffect(() => {
		const t = setTimeout(() => setGiveUp(true), 16000);
		return () => clearTimeout(t);
	}, [resetKey, device]);

	const cur = stops[active] ?? stops[stops.length - 1];
	const beforeDoc = docs.before;
	const afterDoc = docs[`s${active}`];
	const ready = (!!beforeDoc && !!afterDoc) || giveUp;
	const loadError = beforeDoc?.error ?? afterDoc?.error;
	const pageH = Math.max(L.h, beforeDoc?.h ?? 0, afterDoc?.h ?? 0);
	const maxScroll = Math.max(0, pageH - L.h);
	const maxRef = useRef(0);
	maxRef.current = maxScroll;

	const regions = useMemo(() => diffRegions(beforeDoc, afterDoc), [beforeDoc, afterDoc]);
	const regionsRef = useRef(regions);
	regionsRef.current = regions;

	/** Move both frames to `target` (logical px). Eased unless reduced motion or `instant`. */
	const scrollTo = useCallback(
		(target: number, instant?: boolean) => {
			const s = scroll.current;
			s.ty = clamp(target, 0, maxRef.current);
			if (s.raf) cancelAnimationFrame(s.raf);
			const step = () => {
				s.raf = 0;
				const d = s.ty - s.y;
				s.y = instant || reduce || Math.abs(d) < 0.6 ? s.ty : s.y + d * 0.2;
				frames.current.forEach((el) => post(el, s.y));
				setSy(Math.round(s.y));
				if (s.y !== s.ty) s.raf = requestAnimationFrame(step);
			};
			step();
		},
		[post, reduce],
	);
	useEffect(() => () => cancelAnimationFrame(scroll.current.raf), []);

	// open on the part of the page that changed
	const aimed = useRef("");
	useEffect(() => {
		if (!ready) return;
		const key = `${resetKey}|${active}|${device}`;
		if (aimed.current === key) return;
		aimed.current = key;
		if (regions.length) scrollTo(regions[0].top - 90);
	}, [ready, regions, resetKey, active, device, scrollTo]);

	const goRegion = useCallback(
		(i: number) => {
			const rs = regionsRef.current;
			if (!rs.length) return;
			const k = (i + rs.length) % rs.length;
			setRegionIdx(k);
			lens.current.drift = true;
			scrollTo(rs[k].top - 90);
		},
		[scrollTo],
	);

	// ---------- lens physics: ease toward the pointer; hover over the first change until the first touch ----------
	const lens = useRef({ x: 0, y: 0, r: 0, tx: 0, ty: 0, drift: true, t0: 0, init: false });
	useEffect(() => {
		lens.current.drift = true;
		lens.current.r = 0;
		lens.current.init = false;
	}, [resetKey, device]);
	useEffect(() => {
		if (mode !== "lens" || tryIt || !bw) return;
		let raf = 0;
		const s = lens.current;
		s.t0 = performance.now();
		const loop = (now: number) => {
			const box = boxRef.current;
			if (box) {
				// where the changed region sits inside the visible window (box pixels)
				let ax = bw * 0.5;
				let ay = bh * 0.45;
				const view = scroll.current.y;
				const rs = regionsRef.current;
				const r0 = rs.find((r) => r.bottom > view && r.top < view + L.h);
				if (r0) {
					ax = clamp(((r0.left + r0.right) / 2) * scale, bw * 0.12, bw * 0.88);
					ay = clamp(((Math.max(r0.top, view) + Math.min(r0.bottom, view + L.h)) / 2 - view) * scale, bh * 0.15, bh * 0.85);
				}
				if (!s.init) {
					s.x = s.tx = ax;
					s.y = s.ty = ay;
					s.init = true;
				}
				if (s.drift) {
					const amp = reduce ? 0 : 1;
					s.tx = ax + amp * bw * 0.07 * Math.sin((now - s.t0) / 2100);
					s.ty = ay + amp * bh * 0.05 * Math.sin((now - s.t0) / 1500 + 1);
				}
				const k = reduce ? 1 : 0.18;
				s.x += (s.tx - s.x) * k;
				s.y += (s.ty - s.y) * k;
				s.r += (radius - s.r) * (reduce ? 1 : 0.1);
				box.style.setProperty("--lx", `${s.x.toFixed(1)}px`);
				box.style.setProperty("--ly", `${s.y.toFixed(1)}px`);
				box.style.setProperty("--lr", `${Math.max(0, s.r).toFixed(1)}px`);
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [mode, tryIt, bw, bh, radius, reduce, resetKey, scale, L.h]);

	const onMove = useCallback((e: React.PointerEvent) => {
		const box = boxRef.current;
		if (!box) return;
		const r = box.getBoundingClientRect();
		const s = lens.current;
		s.drift = false;
		// the box is rendered at exactly bw x bh, so client offsets are already in box pixels
		s.tx = clamp(e.clientX - r.left, 0, r.width);
		s.ty = clamp(e.clientY - r.top, 0, r.height);
	}, []);

	// wheel scrolls the site while the compare view is focused (click it once); at the ends the page scrolls on
	useEffect(() => {
		const box = boxRef.current;
		if (!box || tryIt) return;
		const onWheel = (e: WheelEvent) => {
			if (e.ctrlKey || document.activeElement !== box) return;
			const dy = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) / scale;
			const next = clamp(scroll.current.ty + dy, 0, maxRef.current);
			if (next === scroll.current.ty) return;
			e.preventDefault();
			scrollTo(next, true);
		};
		box.addEventListener("wheel", onWheel, { passive: false });
		return () => box.removeEventListener("wheel", onWheel);
	}, [scale, scrollTo, tryIt]);

	const onKey = (e: React.KeyboardEvent) => {
		const s = lens.current;
		const nudge = (dx: number, dy: number) => {
			if (mode !== "lens") return false;
			s.drift = false;
			s.tx = clamp(s.tx + dx, 0, bw);
			s.ty = clamp(s.ty + dy, 0, bh);
			return true;
		};
		let used = true;
		switch (e.key) {
			case "ArrowLeft": used = nudge(-36, 0); break;
			case "ArrowRight": used = nudge(36, 0); break;
			case "ArrowUp": used = nudge(0, -36) || (scrollTo(scroll.current.ty - 90, true), true); break;
			case "ArrowDown": used = nudge(0, 36) || (scrollTo(scroll.current.ty + 90, true), true); break;
			case "PageUp": scrollTo(scroll.current.ty - L.h * 0.8); break;
			case "PageDown": scrollTo(scroll.current.ty + L.h * 0.8); break;
			case "Home": scrollTo(0); break;
			case "End": scrollTo(maxRef.current); break;
			case "n": goRegion(regionIdx + 1); break;
			case "p": goRegion(regionIdx - 1); break;
			case "[": if (mode === "lens") setRadius((r) => clamp(r - 20, 70, 320)); else used = false; break;
			case "]": if (mode === "lens") setRadius((r) => clamp(r + 20, 70, 320)); else used = false; break;
			default: used = false;
		}
		if (used) e.preventDefault();
	};

	// replay the changes: step through every stop
	useEffect(() => {
		if (!playing) return;
		const t = setTimeout(() => {
			if (active >= stops.length - 1) setPlaying(false);
			else onActive(active + 1);
		}, 1900);
		return () => clearTimeout(t);
	}, [playing, active, stops.length, onActive]);

	const afterStyle = useMemo<React.CSSProperties>(() => {
		if (mode === "lens") return { clipPath: "circle(var(--lr, 0px) at var(--lx, 50%) var(--ly, 40%))" };
		if (mode === "blend") return { opacity: blend / 100 };
		return { mixBlendMode: "difference" };
	}, [mode, blend]);

	const segBtn = (m: Mode, label: string, hint: string) => (
		<button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => { setMode(m); setTryIt(false); }} title={hint}>
			{label}
		</button>
	);

	const noChange = ready && !loadError && regions.length === 0 && !!beforeDoc && !!afterDoc;
	const showMarks = !tryIt && (mode === "xray" || mode === "blend");
	const railTop = (v: number) => `${(v / pageH) * 100}%`;
	const beforeLabel = beforeSha ? `main @ ${short(beforeSha)}` : "main";

	const onRail = (e: React.PointerEvent<HTMLDivElement>) => {
		const el = e.currentTarget;
		const r = el.getBoundingClientRect();
		if (e.type === "pointerdown") el.setPointerCapture(e.pointerId);
		else if (!el.hasPointerCapture(e.pointerId)) return;
		scrollTo(((e.clientY - r.top) / r.height) * pageH - L.h / 2, true);
	};

	return (
		<div className="cmp" data-rv-hero>
			<div className="cmp-bar">
				<div className="seg" role="radiogroup" aria-label="How to compare">
					{segBtn("lens", "Lens", "Drag a lens over the old site to see the new one inside it")}
					{segBtn("blend", "Blend", "Fade between old and new")}
					{segBtn("xray", "X-ray", "Dark means nothing changed; colour is what changed")}
				</div>
				<div className="cmp-bar-r">
					{regions.length > 0 && !tryIt && (
						<div className="cmp-changes" role="group" aria-label="Jump between changed parts of the page">
							<button className="tog" onClick={() => goRegion(regionIdx - 1)} aria-label="Previous change" disabled={regions.length < 2}>&larr;</button>
							<span className="cmp-changes-n" aria-live="polite">Change {Math.min(regionIdx + 1, regions.length)} of {regions.length}</span>
							<button className="tog" onClick={() => goRegion(regionIdx + 1)} aria-label="Next change" disabled={regions.length < 2}>&rarr;</button>
						</div>
					)}
					<div className="seg" role="radiogroup" aria-label="Screen size">
						<button role="radio" aria-checked={device === "desktop"} className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}>Desktop</button>
						<button role="radio" aria-checked={device === "phone"} className={device === "phone" ? "on" : ""} onClick={() => setDevice("phone")}>Phone</button>
					</div>
					<button className={"tog" + (tryIt ? " on" : "")} aria-pressed={tryIt} onClick={() => setTryIt((v) => !v)}>
						{tryIt ? "Back to compare" : "Try the new site"}
					</button>
				</div>
			</div>

			<div className="cmp-legend" aria-hidden="true">
				<span className="cmp-chip l">Before: <b className="mono">{beforeLabel}</b></span>
				<span className="cmp-chip r">{tryIt ? "Live: " : "After: "}{cur.label}</span>
			</div>

			<div className="cmp-stage" ref={stageRef} style={{ height: bh + (device === "phone" ? 32 : 0) }}>
				<div
					className={`cmp-box mode-${tryIt ? "try" : mode} ${device}`}
					ref={boxRef}
					style={{ width: bw, height: bh }}
					tabIndex={0}
					role="group"
					aria-label={tryIt ? "The new site, live" : "Before and after comparison. Arrow keys move the lens or scroll, Page Up and Page Down scroll the page, N and P jump between changes."}
					onKeyDown={tryIt ? undefined : onKey}
					onPointerMove={mode === "lens" && !tryIt ? onMove : undefined}
					onPointerDown={(e) => {
						if (tryIt) return;
						boxRef.current?.focus({ preventScroll: true });
						if (mode === "lens") onMove(e);
					}}
				>
					{tryIt ? (
						<div className="cmp-layer">
							<SiteFrame src={previewUrl(jobId, cur.sha, cur.on)} device={device} scale={scale} title={`The live site: ${cur.label}`} interactive eager />
						</div>
					) : (
						<div className="cmp-stack">
							<div className="cmp-layer before">
								<SyncFrame key={"before" + device} id="before" src={previewUrl(jobId, beforeSha)} device={device} scale={scale} title="The site before this chapter" reg={reg} onDoc={onDoc} />
							</div>
							<div className="cmp-after" style={afterStyle} data-testid="after">
								{stops.map((s, i) =>
									seen.has(i) ? (
										<div key={s.key + device} className={"cmp-layer after" + (i === active ? " cur" : "")} style={{ opacity: i === active ? 1 : 0 }}>
											<SyncFrame id={`s${i}`} src={previewUrl(jobId, s.sha, s.on)} device={device} scale={scale} title={`The site after: ${s.label}`} reg={reg} onDoc={onDoc} />
										</div>
									) : null,
								)}
							</div>
						</div>
					)}
					{showMarks &&
						regions.map((r, i) => {
							const top = (r.top - sy) * scale;
							const h = (r.bottom - r.top) * scale;
							if (top > bh || top + h < 0) return null;
							return <i key={i} className={"cmp-mark" + (i === regionIdx ? " cur" : "")} style={{ left: Math.max(0, r.left * scale - 4), top: Math.max(0, top - 4), width: Math.min(bw, (r.right - r.left) * scale + 8), height: Math.min(bh, h + 8) }} aria-hidden="true" />;
						})}
					{mode === "lens" && !tryIt && (
						<div className="cmp-rim" aria-hidden="true">
							<span>After</span>
						</div>
					)}
					{!ready && !tryIt && (
						<div className="cmp-wait" role="status">
							<span className="cmp-spin" />
							<span>Opening the site at this commit…</span>
						</div>
					)}
					{ready && loadError && !tryIt && (
						<div className="cmp-wait err" role="alert">
							<span>{loadError} The code changes below still show exactly what this chapter did.</span>
						</div>
					)}
				</div>
				{!tryIt && (
					<div
						className="cmp-rail"
						style={{ height: bh, marginTop: device === "phone" ? 16 : 0 }}
						role="slider"
						tabIndex={0}
						aria-label="Scroll the site"
						aria-orientation="vertical"
						aria-valuemin={0}
						aria-valuemax={Math.round(maxScroll)}
						aria-valuenow={Math.round(sy)}
						onPointerDown={onRail}
						onPointerMove={onRail}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown" || e.key === "ArrowUp") {
								e.preventDefault();
								scrollTo(scroll.current.ty + (e.key === "ArrowDown" ? 120 : -120), true);
							}
						}}
					>
						{regions.map((r, i) => (
							<i key={i} className={"rail-mark" + (i === regionIdx ? " cur" : "")} style={{ top: railTop(r.top), height: `max(4px, ${((r.bottom - r.top) / pageH) * 100}%)` }} />
						))}
						<b className="rail-thumb" style={{ top: railTop(sy), height: `${(L.h / pageH) * 100}%` }} />
					</div>
				)}
			</div>

			{noChange && !tryIt && (
				<p className="cmp-none" role="note">
					Nothing on screen changed in this chapter. It edits code that visitors never see directly (headers, tests, build or server code), so the proof is in the diff below, not the page.
				</p>
			)}

			<div className="cmp-ctl">
				{tryIt ? (
					<p className="cmp-hint">You are using the real merged site at <span className="mono">{short(cur.sha)}</span>. Click, search, toggle.</p>
				) : mode === "lens" ? (
					<label className="cmp-range">
						<span>Lens size</span>
						<input type="range" min={70} max={320} value={radius} onChange={(e) => setRadius(+e.target.value)} />
						<span className="cmp-hint">Move over the page. Inside the ring is the new site. Click the page, then scroll or drag the bar at its right.</span>
					</label>
				) : mode === "blend" ? (
					<label className="cmp-range">
						<span>Old</span>
						<input type="range" min={0} max={100} value={blend} onChange={(e) => setBlend(+e.target.value)} aria-label="Fade from old to new site" />
						<span>New</span>
						<span className="cmp-hint">Outlines mark what changed.</span>
					</label>
				) : (
					<p className="cmp-hint">
						<i className="xray-key" /> Black means nothing changed. Anything lit up is different between old and new, outlined in orange.
					</p>
				)}
			</div>

			<Scrubber stops={stops} active={active} onActive={(i) => { setPlaying(false); onActive(i); }} playing={playing} onPlay={() => { if (active >= stops.length - 1) onActive(0); setPlaying((p) => !p); }} />
		</div>
	);
}

/** The step scrubber: each hire task is a stop, the last is the merged result. */
function Scrubber({ stops, active, onActive, playing, onPlay }: { stops: Stop[]; active: number; onActive: (i: number) => void; playing: boolean; onPlay: () => void }) {
	if (stops.length < 2) return null;
	return (
		<div className="scrub" role="group" aria-label="Step through this chapter's changes">
			<button className="scrub-play" onClick={onPlay} aria-pressed={playing}>
				{playing ? "Pause" : "Replay the changes"}
			</button>
			<ol className="scrub-track">
				{stops.map((s, i) => (
					<li key={s.key} className={(i <= active ? "past " : "") + (i === active ? "now" : "")}>
						<button onClick={() => onActive(i)} aria-current={i === active ? "step" : undefined} style={{ ["--c" as string]: s.color ?? "var(--ink)", ["--ct" as string]: s.textColor ?? "#fff" }}>
							<i className="scrub-dot" />
							<span className="scrub-l">{s.label}</span>
							<span className="scrub-d mono">{s.final ? "main " : "fork "}{short(s.sha)}</span>
						</button>
					</li>
				))}
			</ol>
		</div>
	);
}
