import { memo } from "react";
import type { AState } from "./derive";

/** Each state has its own SHAPE and motion as well as its own colour, so the swarm reads without colour. */
const STAR = (() => {
	const pts: string[] = [];
	for (let i = 0; i < 12; i++) {
		const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
		const r = i % 2 === 0 ? 9.2 : 4.6;
		pts.push(`${(10 + Math.cos(a) * r).toFixed(2)},${(10 + Math.sin(a) * r).toFixed(2)}`);
	}
	return pts.join(" ");
})();

export const Glyph = memo(function Glyph({ state, size = 18 }: { state: AState; size?: number }) {
	return (
		<svg className={`gl gl-${state}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			{state === "idle" && <circle cx="10" cy="10" r="6" fill="none" strokeWidth="1.8" strokeDasharray="3 2.4" />}
			{state === "working" && (
				<>
					<circle className="gl-ring" cx="10" cy="10" r="6.5" fill="none" strokeWidth="1.6" />
					<circle className="gl-core" cx="10" cy="10" r="5.6" />
				</>
			)}
			{state === "committed" && (
				<>
					<rect x="3" y="3" width="14" height="14" rx="3.4" fill="none" strokeWidth="2" />
					<path d="M6.6 10.4 9 12.8l4.6-5.4" fill="none" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
				</>
			)}
			{state === "conflict" && <polygon className="gl-jag" points={STAR} strokeWidth="1.2" strokeLinejoin="miter" />}
			{state === "merged" && <rect x="2.4" y="2.4" width="15.2" height="15.2" rx="4.2" />}
			{state === "rejected" && (
				<>
					<circle cx="10" cy="10" r="7.6" fill="none" strokeWidth="1.8" />
					<path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" strokeWidth="2.2" strokeLinecap="round" fill="none" />
				</>
			)}
			{state === "paused" && (
				<>
					<rect x="4.6" y="3.6" width="3.8" height="12.8" rx="1.1" />
					<rect x="11.6" y="3.6" width="3.8" height="12.8" rx="1.1" />
				</>
			)}
		</svg>
	);
});

export const STATE_HEX: Record<AState, string> = { idle: "#7d8ba3", working: "#ff9a3c", committed: "#5ccbe8", conflict: "#ff5e50", merged: "#3ddc84", rejected: "#ff7b70", paused: "#f5c451" };
