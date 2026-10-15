import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/** A number that rolls to its new value. Reduced motion jumps straight there. */
export function Ticker({ value, decimals = 0, ms = 900, className }: { value: number; decimals?: number; ms?: number; className?: string }) {
	const reduce = useReducedMotion();
	const [shown, setShown] = useState(value);
	const from = useRef(value);
	useEffect(() => {
		if (reduce || shown === value) {
			setShown(value);
			from.current = value;
			return;
		}
		const start = performance.now();
		const a = from.current;
		let raf = 0;
		const tick = (now: number) => {
			const p = Math.min(1, (now - start) / ms);
			const e = 1 - Math.pow(1 - p, 3);
			const v = a + (value - a) * e;
			setShown(v);
			from.current = v;
			if (p < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, reduce, ms]);
	return <span className={`num ${className ?? ""}`}>{shown.toFixed(decimals)}</span>;
}

export function Delta({ from, to }: { from: number; to: number }) {
	const d = to - from;
	if (d === 0) return null;
	return (
		<span className={`delta ${d > 0 ? "up" : "down"}`}>
			<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
				<path d={d > 0 ? "M4.5 1 8 7H1z" : "M4.5 8 1 2h7z"} fill="currentColor" />
			</svg>
			{d > 0 ? "+" : "−"}
			{Math.abs(d)}
		</span>
	);
}
