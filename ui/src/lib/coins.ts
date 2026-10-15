let layer: HTMLDivElement | null = null;

function getLayer(): HTMLDivElement {
	if (layer && document.body.contains(layer)) return layer;
	layer = document.createElement("div");
	layer.setAttribute("aria-hidden", "true");
	layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden";
	document.body.appendChild(layer);
	return layer;
}

/** Streak of coin-bricks from `src` to `dst`. Pure DOM + Web Animations, so React never re-renders per frame. */
export function flyCoins(src: Element, dst: Element, color: string, reduce: boolean, onArrive?: () => void, count = 10) {
	if (reduce) {
		onArrive?.();
		return;
	}
	const a = src.getBoundingClientRect();
	const b = dst.getBoundingClientRect();
	const sx = a.left + a.width * 0.5;
	const sy = a.top + a.height * 0.5;
	const ex = b.left + b.width / 2;
	const ey = b.top + b.height / 2;
	const host = getLayer();
	let landed = 0;
	for (let i = 0; i < count; i++) {
		const el = document.createElement("i");
		el.style.cssText = `position:absolute;left:0;top:0;width:16px;height:7px;border-radius:2px;background:${color};box-shadow:0 0 0 1.5px #0F1826;opacity:0;will-change:transform`;
		host.appendChild(el);
		const jitter = (Math.random() - 0.5) * 60;
		const cx = (sx + ex) / 2 + jitter;
		const cy = Math.min(sy, ey) - 90 - Math.random() * 60;
		const frames: Keyframe[] = [];
		const steps = 12;
		for (let s = 0; s <= steps; s++) {
			const t = s / steps;
			const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex;
			const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey;
			const rot = t * 360 * (i % 2 ? 1 : -1);
			frames.push({ transform: `translate(${x - 8}px, ${y - 3}px) rotate(${rot}deg) scale(${0.7 + Math.sin(t * Math.PI) * 0.5})`, opacity: s === 0 ? 0 : s === steps ? 0 : 1, offset: t });
		}
		const anim = el.animate(frames, { duration: 950 + Math.random() * 350, delay: i * 85, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" });
		anim.onfinish = () => {
			el.remove();
			landed++;
			if (landed === count) onArrive?.();
		};
	}
}
