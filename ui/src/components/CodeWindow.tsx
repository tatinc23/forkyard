import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Lane } from "../engine/state";
import { highlight, langOf } from "../lib/highlight";

const VISIBLE = 9;

function useRevealed(text: string, reduce: boolean) {
	const [n, setN] = useState(reduce ? text.length : 0);
	const ref = useRef({ n: reduce ? text.length : 0, text });
	useEffect(() => {
		ref.current.text = text;
		if (reduce) {
			ref.current.n = text.length;
			setN(text.length);
			return;
		}
		if (ref.current.n > text.length) {
			ref.current.n = text.length;
			setN(text.length);
		}
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(80, now - last);
			last = now;
			const target = ref.current.text.length;
			if (ref.current.n < target) {
				const backlog = target - ref.current.n;
				const speed = Math.max(120, backlog * 3.2); // chars per second, catches up when behind
				ref.current.n = Math.min(target, ref.current.n + (speed * dt) / 1000);
				setN(Math.floor(ref.current.n));
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [text, reduce]);
	return n;
}

export function CodeWindow({ lane, color }: { lane: Lane; color: string }) {
	const reduce = !!useReducedMotion();
	const path = lane.currentPath ?? lane.paths[0] ?? "";
	const full = lane.files[path] ?? "";
	const n = useRevealed(full, reduce);
	const shown = full.slice(0, n);
	const lines = shown.split("\n");
	const start = Math.max(0, lines.length - VISIBLE);
	const vis = lines.slice(start);
	const typing = n < full.length || lane.status === "working" || lane.status === "resolving";
	const lang = langOf(path);
	const idle = full.length === 0;
	const reviewing = lane.status === "delivered";

	return (
		<div className="code" data-status={lane.status} style={{ ["--c" as string]: color }}>
			<div className="code-tabs" role="tablist" aria-label="Files this agent can edit">
				{lane.paths.map((p) => (
					<span key={p} role="tab" aria-selected={p === path} className={`tab mono ${p === path ? "on" : ""}`}>
						{p}
					</span>
				))}
				<span className="code-fork mono">{lane.fork ? lane.fork.name.replace(/^forkyard-/, "") : "no fork yet"}</span>
			</div>
			<div className="code-body mono" aria-live="off">
				{idle ? (
					<div className="code-idle">
						{lane.status === "offered" && <span>Contract offered. Waiting for the plan to be approved.</span>}
						{lane.status === "forking" && (
							<span>
								Forking the repository<i className="dots" aria-hidden="true" />
							</span>
						)}
						{!["offered", "forking"].includes(lane.status) && <span>{lane.thought?.text ?? "Waiting for the next commit"}</span>}
					</div>
				) : (
					vis.map((l, i) => {
						const last = i === vis.length - 1;
						return (
							<div key={start + i} className="ln">
								<span className="no">{start + i + 1}</span>
								<span className="ctx">
									{highlight(l, lang).map((t, k) => (
										<span key={k} className={t.c ? `tk-${t.c}` : undefined}>
											{t.t}
										</span>
									))}
									{last && typing && <span className="caret" />}
								</span>
							</div>
						);
					})
				)}
			</div>
			{reviewing && (
				<div className="scan" aria-hidden="true">
					<span className="mono">Inspector is reviewing</span>
				</div>
			)}
		</div>
	);
}
