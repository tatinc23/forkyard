import { useMemo } from "react";
import { brick } from "../lib/color";

function rng(seed: number) {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Generative avatar: a mirrored 5x5 brick pattern from the roster's `glyph` seed, tinted with the agent's colour. */
export function Avatar({ seed, color, size = 40, label, agentId }: { seed: number; color: string; size?: number; label?: string; agentId?: string }) {
	const cells = useMemo(() => {
		const r = rng(seed * 9973 + 17);
		const out: { x: number; y: number; tint: boolean }[] = [];
		for (let y = 0; y < 5; y++) {
			for (let x = 0; x < 3; x++) {
				if (r() > 0.46) {
					const tint = r() > 0.62;
					out.push({ x, y, tint });
					if (x < 2) out.push({ x: 4 - x, y, tint });
				}
			}
		}
		if (out.length < 8) out.push({ x: 2, y: 1, tint: false }, { x: 2, y: 2, tint: false }, { x: 2, y: 3, tint: false });
		return out;
	}, [seed]);
	const b = brick(color);
	return (
		<span className="avatar" data-agent-avatar={agentId} style={{ width: size, height: size, ["--c" as string]: b.fill }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
			<svg viewBox="0 0 7 7" width={size} height={size} shapeRendering="geometricPrecision">
				<rect width="7" height="7" rx="1.1" fill={b.fill} opacity="0.2" />
				{cells.map((c, i) => (
					<rect key={i} x={c.x + 1.06} y={c.y + 1.06} width="0.88" height="0.88" rx="0.16" fill={b.fill} opacity={c.tint ? 0.55 : 1} />
				))}
			</svg>
		</span>
	);
}
