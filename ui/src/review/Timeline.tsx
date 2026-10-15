import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { ReviewView, TimelineItem } from "@shared/types";
import { Avatar } from "../components/Avatar";
import { SiteFrame, useWidth } from "./Compare";
import { previewUrl, short, type AgentInfo } from "./helpers";

const STEP = 62;
const PAD = 44;
const LANE_H = 66;
const LABEL_W = 108;

const KIND: Record<TimelineItem["kind"], string> = {
	seed: "Starting point",
	task: "Work on the agent's own fork",
	resolve: "Conflict re-built on a fork",
	merge: "Merged onto main",
	revert: "Reverted from main",
};

type Edge = { from: number; to: number; key: string };

export function Timeline({ review, whoOf, onOpenChapter }: { review: ReviewView; whoOf: (id?: string) => AgentInfo; onOpenChapter: (contractId: string) => void }) {
	const reduce = !!useReducedMotion();
	const items = useMemo(() => [...review.timeline].sort((a, b) => (a.kind === "seed" ? -1 : b.kind === "seed" ? 1 : a.at - b.at)), [review.timeline]);
	const lanes = useMemo(() => {
		const forks: string[] = [];
		for (const it of items) if (it.on !== "main" && !forks.includes(it.on)) forks.push(it.on);
		return [...forks, "main"];
	}, [items]);
	const [idx, setIdx] = useState(items.length - 1);
	const [playing, setPlaying] = useState(false);
	const [device, setDevice] = useState<"desktop" | "phone">(() => (typeof window !== "undefined" && window.innerWidth < 720 ? "phone" : "desktop"));
	const scroller = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);
	const [stageRef, cw] = useWidth<HTMLDivElement>();

	const pos = (i: number) => ({ x: PAD + i * STEP, y: lanes.indexOf(items[i].on) * LANE_H + LANE_H / 2 });
	const width = PAD * 2 + (items.length - 1) * STEP;
	const height = lanes.length * LANE_H;

	// edges: seed -> first work on a fork; main -> a conflict rebuild; last work on a fork -> its merge
	const edges = useMemo(() => {
		const out: Edge[] = [];
		const lastFork = new Map<string, number>();
		let lastMain = 0;
		items.forEach((it, i) => {
			if (it.kind === "merge" || it.kind === "revert") {
				const src = it.contractId != null ? lastFork.get(it.contractId) : undefined;
				if (src != null) out.push({ from: src, to: i, key: `m${i}` });
				else if (i > 0) out.push({ from: lastMain, to: i, key: `m${i}` });
				lastMain = i;
			} else if (it.kind === "task") {
				out.push({ from: (it.contractId != null ? lastFork.get(it.contractId) : undefined) ?? 0, to: i, key: `t${i}` });
				if (it.contractId != null) lastFork.set(it.contractId, i);
			} else if (it.kind === "resolve") {
				const prev = it.contractId != null ? lastFork.get(it.contractId) : undefined;
				out.push({ from: prev ?? lastMain, to: i, key: `r${i}` });
				if (it.contractId != null) lastFork.set(it.contractId, i);
			}
		});
		return out;
	}, [items]);

	const pick = useCallback(
		(clientX: number) => {
			const el = scroller.current;
			if (!el) return;
			const x = clientX - el.getBoundingClientRect().left + el.scrollLeft;
			setIdx(Math.max(0, Math.min(items.length - 1, Math.round((x - PAD) / STEP))));
		},
		[items.length],
	);

	// keep the playhead in view
	useEffect(() => {
		const el = scroller.current;
		if (!el || !items.length) return;
		const x = PAD + idx * STEP;
		const left = x - el.clientWidth / 2;
		el.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
	}, [idx, reduce, items.length]);

	// play: walk the commits in order
	useEffect(() => {
		if (!playing) return;
		if (idx >= items.length - 1) {
			setPlaying(false);
			return;
		}
		const t = setTimeout(() => setIdx((i) => i + 1), 1000);
		return () => clearTimeout(t);
	}, [playing, idx, items.length]);

	// arrow keys step commits while this mode is open
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
			if (e.key === "ArrowRight") setIdx((i) => Math.min(items.length - 1, i + 1));
			else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
			else return;
			setPlaying(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [items.length]);

	const cur = items[idx];
	const who = whoOf(cur?.agentId);
	const chapter = review.chapters.find((c) => c.contractId === cur?.contractId);

	// preview with a crossfade between the previous and current commit
	const url = cur ? previewUrl(review.jobId, cur.sha, cur.on) : "";
	const [layers, setLayers] = useState<{ id: number; url: string }[]>([]);
	const counter = useRef(0);
	useEffect(() => {
		if (!url) return;
		counter.current += 1;
		const id = counter.current;
		setLayers((l) => [...l.slice(-1), { id, url }]);
		const t = setTimeout(() => setLayers((l) => l.filter((x) => x.id === id)), 700);
		return () => clearTimeout(t);
	}, [url]);

	const L = device === "desktop" ? { w: 1180, h: 740 } : { w: 390, h: 800 };
	const maxH = typeof window !== "undefined" ? Math.max(380, window.innerHeight * 0.7) : 600;
	const scale = cw ? Math.min(cw / L.w, device === "phone" ? maxH / L.h : 1, 1) : 0.5;

	if (!cur) return <p className="rv-code-empty">No commits to show yet.</p>;

	return (
		<div className="tl">
			<div className="tl-bar">
				<div className="tl-ctl">
					<button className="btn ghost" onClick={() => { setIdx(0); setPlaying(false); }} disabled={idx === 0}>Start</button>
					<button className="btn dark" aria-pressed={playing} onClick={() => { if (idx >= items.length - 1) setIdx(0); setPlaying((p) => !p); }}>
						{playing ? "Pause" : "Play the build"}
					</button>
				</div>
				<p className="tl-count mono" aria-live="polite">Commit {idx + 1} of {items.length}</p>
			</div>

			<div className="tl-wrap">
				<div className="tl-labels" style={{ width: LABEL_W, height }}>
					{lanes.map((l) => {
						const w = l === "main" ? null : whoOf(l);
						return (
							<div key={l} className="tl-lane-l" style={{ height: LANE_H }}>
								{w ? <Avatar seed={w.glyph} color={w.color} size={24} /> : <i className="tl-main-dot" />}
								<span className="tl-lane-n">{l === "main" ? "main" : w!.name}</span>
							</div>
						);
					})}
				</div>
				<div
					className="tl-scroll"
					ref={scroller}
					onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); pick(e.clientX); setPlaying(false); }}
					onPointerMove={(e) => { if (dragging.current) pick(e.clientX); }}
					onPointerUp={() => { dragging.current = false; }}
					onPointerCancel={() => { dragging.current = false; }}
				>
					<div className="tl-track" style={{ width, height }}>
						{lanes.map((l, i) => (
							<div key={l} className={"tl-lane" + (l === "main" ? " main" : "")} style={{ top: i * LANE_H, height: LANE_H }} />
						))}
						<svg className="tl-edges" width={width} height={height} aria-hidden="true">
							{edges.map((e, k) => {
								const a = pos(e.from);
								const b = pos(e.to);
								const mx = (a.x + b.x) / 2;
								const col = whoOf(items[e.to].agentId ?? items[e.from].agentId).fill;
								const isMain = items[e.to].on === "main" && items[e.from].on === "main";
								return (
									<path
										key={e.key}
										d={`M${a.x + 25},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x - 25},${b.y}`}
										pathLength={1}
										className={"tl-edge" + (e.to <= idx ? " lit" : "")}
										style={{ stroke: isMain ? "var(--steel-2)" : col, animationDelay: reduce ? "0ms" : `${300 + Math.min(k, 30) * 50}ms` }}
									/>
								);
							})}
						</svg>
						<div className="tl-head" style={{ left: PAD + idx * STEP }} aria-hidden="true" />
						{items.map((it, i) => {
							const p = pos(i);
							const w = whoOf(it.agentId);
							const isMain = it.on === "main";
							return (
								<button
									key={it.sha + i}
									className={`tl-node k-${it.kind}` + (i === idx ? " now" : "") + (i < idx ? " past" : "")}
									style={{ left: p.x - 25, top: p.y - 12, backgroundColor: isMain ? "var(--steel)" : w.fill, color: isMain ? "#fff" : w.text, ["--ag" as string]: w.fill, animationDelay: reduce ? "0ms" : `${Math.min(i, 30) * 40}ms` }}
									onClick={(e) => { e.stopPropagation(); setIdx(i); setPlaying(false); }}
									onPointerDown={(e) => e.stopPropagation()}
									aria-label={`${it.title}, ${KIND[it.kind]}`}
									aria-current={i === idx ? "step" : undefined}
								>
									<span className="mono">{short(it.sha).slice(0, 4)}</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
			<input className="tl-range" type="range" min={0} max={items.length - 1} value={idx} onChange={(e) => { setIdx(+e.target.value); setPlaying(false); }} aria-label="Scrub through every commit" />

			<div className="tl-detail">
				<div className="tl-preview">
					<div className="cmp-bar slim">
						<span className="tl-where mono">{cur.on === "main" ? "main" : `fork / ${cur.on}`} @ {short(cur.sha)}</span>
						<div className="seg" role="radiogroup" aria-label="Screen size">
							<button role="radio" aria-checked={device === "desktop"} className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}>Desktop</button>
							<button role="radio" aria-checked={device === "phone"} className={device === "phone" ? "on" : ""} onClick={() => setDevice("phone")}>Phone</button>
						</div>
					</div>
					<div className="cmp-stage" ref={stageRef} style={{ height: Math.round(L.h * scale) + (device === "phone" ? 24 : 0) }}>
						<div className={`cmp-box mode-try ${device}`} style={{ width: Math.round(L.w * scale), height: Math.round(L.h * scale) }} data-testid="tl-preview">
							{layers.map((l, i) => (
								<div key={l.id} className={"cmp-layer tl-layer" + (i === layers.length - 1 ? " fresh" : "")}>
									<SiteFrame src={l.url} device={device} scale={scale} title={`The site at ${short(cur.sha)}`} eager />
								</div>
							))}
						</div>
					</div>
				</div>
				<div className="tl-info" style={{ ["--ag" as string]: who.fill }}>
					<p className={`tl-kind k-${cur.kind}`}>{KIND[cur.kind]}</p>
					<h3>{cur.title}</h3>
					{cur.story && <p className="tl-story">{cur.story}</p>}
					{cur.agentId && (
						<p className="tl-by">
							<Avatar seed={who.glyph} color={who.color} size={22} /> {who.name}
						</p>
					)}
					{chapter?.changes && (
						<ul className="tl-files">
							{chapter.changes.files.map((f) => (
								<li key={f.path}>
									<span className="mono">{f.path}</span>
									<span className="mono"><b className="add">+{f.added}</b> <b className="del">&minus;{f.removed}</b></span>
								</li>
							))}
						</ul>
					)}
					{chapter && (
						<button className="link" onClick={() => onOpenChapter(chapter.contractId)}>
							Audit {who.name}'s chapter
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
