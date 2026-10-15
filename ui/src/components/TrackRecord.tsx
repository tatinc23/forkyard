import type { Agent } from "../types";

/** One tick per contract on the agent's record: merged clean, merged after a conflict, or not merged. Straight from `stats`. */
export function TrackRecord({ agent, max = 24 }: { agent: Agent; max?: number }) {
	const { contracts, merged, conflicts } = agent.stats;
	const shown = Math.min(contracts, max);
	const scale = contracts > 0 ? shown / contracts : 1;
	const mergedN = Math.round(merged * scale);
	const confN = Math.min(mergedN, Math.round(conflicts * scale));
	const ticks = Array.from({ length: shown }, (_, i) => (i < mergedN - confN ? "ok" : i < mergedN ? "conf" : "miss"));
	return (
		<span className="track" role="img" aria-label={`${merged} of ${contracts} contracts merged, ${conflicts} needed a conflict fix`}>
			{ticks.map((t, i) => (
				<i key={i} className={t} />
			))}
			{contracts === 0 && <em>no contracts yet</em>}
		</span>
	);
}

/** In-session reputation line; only drawn once there is real movement to show. */
export function Spark({ values, w = 64, h = 20 }: { values: number[]; w?: number; h?: number }) {
	if (values.length < 2) return null;
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - ((v - lo) / Math.max(1, hi - lo)) * (h - 6)}`).join(" ");
	return (
		<svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
			<polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	);
}
