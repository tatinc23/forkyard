import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

type Branch = { x0: number; len: number; off: number; color: string; born: number; dots: number[]; mergedAt: number };

/**
 * The hero background: a commit graph that scrolls past. A grey trunk ("main") runs under the page; coloured hires fork off it,
 * grow along their own line while commit dots appear, then curve back and merge in a small pulse. Agents building in parallel.
 * Reduced motion draws one still frame.
 */
export function HeroField({ colors }: { colors: string[] }) {
	const ref = useRef<HTMLCanvasElement>(null);
	const reduce = useReducedMotion();

	useEffect(() => {
		const canvas = ref.current;
		const host = canvas?.parentElement;
		if (!canvas || !host) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let w = 0,
			h = 0,
			dpr = 1,
			trunkY = 0,
			lane = 26;
		const SPEED = 22; // px per second the graph scrolls left
		const RAMP = 70;
		const branches: Branch[] = [];
		const pointer = { x: -9999, y: -9999 };
		let raf = 0;
		let last = 0;
		let scroll = 0; // world x of the left edge
		let nextFork = 0;
		let laneCursor = 0;

		const resize = () => {
			const r = host.getBoundingClientRect();
			w = r.width;
			h = r.height;
			dpr = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			trunkY = h - (w < 640 ? 30 : 40);
			lane = w < 640 ? 17 : 22;
		};

		const lanesAvailable = () => 4;

		const fork = (atX: number, t: number, presetAge = 0) => {
			const n = lanesAvailable();
			laneCursor = (laneCursor + 1 + Math.floor(Math.random() * 2)) % n;
			const off = -(laneCursor + 1) * lane;
			const len = 360 + Math.random() * 520;
			const dots: number[] = [];
			const count = 2 + Math.floor(Math.random() * 4);
			for (let i = 0; i < count; i++) dots.push((RAMP + 30 + ((len - 2 * RAMP - 60) * (i + 0.5 + Math.random() * 0.4)) / count) / len);
			branches.push({ x0: atX, len, off, color: colors[Math.floor(Math.random() * colors.length)] ?? "#F6821F", born: t - presetAge, dots, mergedAt: -1 });
		};

		// y on a branch at distance d along its length
		const yAt = (b: Branch, d: number) => {
			if (d < 0 || d > b.len) return trunkY;
			if (d < RAMP) return trunkY + b.off * ease(d / RAMP);
			if (d > b.len - RAMP) return trunkY + b.off * ease((b.len - d) / RAMP);
			return trunkY + b.off;
		};
		const ease = (p: number) => p * p * (3 - 2 * p);

		const draw = (t: number) => {
			ctx.clearRect(0, 0, w, h);
			// trunk
			ctx.lineWidth = 3;
			ctx.strokeStyle = "rgba(15,24,38,0.22)";
			ctx.beginPath();
			ctx.moveTo(0, trunkY);
			ctx.lineTo(w, trunkY);
			ctx.stroke();
			// trunk commits (grey dots scrolling by)
			ctx.fillStyle = "rgba(15,24,38,0.3)";
			const spacing = 120;
			for (let x = -((scroll % spacing) + spacing) % spacing; x < w + spacing; x += spacing) {
				ctx.beginPath();
				ctx.arc(x, trunkY, 4, 0, Math.PI * 2);
				ctx.fill();
			}
			for (const b of branches) {
				const sx = b.x0 - scroll;
				if (sx > w + 40 || sx + b.len < -40) continue;
				const age = (t - b.born) / 1000;
				const grown = reduce ? b.len : Math.min(b.len, age * 220);
				const near = pointer.x > -999 ? Math.max(0, 1 - Math.hypot(sx + grown * 0.5 - pointer.x, trunkY + b.off - pointer.y) / 260) : 0;
				ctx.lineWidth = 2.5 + near * 1.5;
				ctx.strokeStyle = b.color;
				ctx.globalAlpha = 0.5 + near * 0.45;
				ctx.beginPath();
				const steps = Math.max(2, Math.ceil(grown / 8));
				for (let i = 0; i <= steps; i++) {
					const d = (grown * i) / steps;
					const x = sx + d;
					const y = yAt(b, d);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
				// commit dots that the head has passed
				ctx.globalAlpha = 0.95;
				for (const p of b.dots) {
					const d = p * b.len;
					if (d > grown) continue;
					const x = sx + d;
					ctx.beginPath();
					ctx.arc(x, trunkY + b.off, 5, 0, Math.PI * 2);
					ctx.fillStyle = "#F7F8F9";
					ctx.fill();
					ctx.lineWidth = 2.5;
					ctx.strokeStyle = b.color;
					ctx.stroke();
				}
				// the head
				if (grown < b.len) {
					ctx.beginPath();
					ctx.arc(sx + grown, yAt(b, grown), 4, 0, Math.PI * 2);
					ctx.fillStyle = b.color;
					ctx.fill();
				} else {
					// merge pulse on the trunk
					if (b.mergedAt < 0) b.mergedAt = t;
					const mp = (t - b.mergedAt) / 900;
					const mx = sx + b.len;
					if (mp < 1 && !reduce) {
						ctx.beginPath();
						ctx.arc(mx, trunkY, 4 + mp * 20, 0, Math.PI * 2);
						ctx.globalAlpha = 0.7 * (1 - mp);
						ctx.lineWidth = 2;
						ctx.strokeStyle = b.color;
						ctx.stroke();
					}
					ctx.globalAlpha = 1;
					ctx.beginPath();
					ctx.arc(mx, trunkY, 5, 0, Math.PI * 2);
					ctx.fillStyle = b.color;
					ctx.fill();
				}
				// fork node
				ctx.globalAlpha = 1;
				ctx.beginPath();
				ctx.arc(sx, trunkY, 5, 0, Math.PI * 2);
				ctx.fillStyle = b.color;
				ctx.fill();
				ctx.globalAlpha = 1;
			}
		};

		const step = (t: number) => {
			const dt = Math.min(64, t - (last || t));
			last = t;
			scroll += (SPEED * dt) / 1000;
			for (let i = branches.length - 1; i >= 0; i--) if (branches[i].x0 + branches[i].len - scroll < -60) branches.splice(i, 1);
			if (t >= nextFork) {
				fork(scroll + w + 20 - Math.random() * w * 0.5, t);
				nextFork = t + 700 + Math.random() * 1100;
			}
		};

		const loop = (t: number) => {
			step(t);
			draw(t);
			raf = requestAnimationFrame(loop);
		};
		const onMove = (e: PointerEvent) => {
			const r = host.getBoundingClientRect();
			pointer.x = e.clientX - r.left;
			pointer.y = e.clientY - r.top;
		};
		const onLeave = () => {
			pointer.x = pointer.y = -9999;
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(host);

		if (reduce) {
			// One still frame: forks spread across the width, fully grown.
			for (let i = 0; i < 7; i++) fork((i / 7) * (w + 300) - 120, 0);
			draw(0);
			return () => ro.disconnect();
		}

		// Pre-seed so the first frame is already alive.
		for (let i = 0; i < 6; i++) fork((i / 6) * (w + 400) - 160, 0, 4000 + Math.random() * 3000);
		host.addEventListener("pointermove", onMove);
		host.addEventListener("pointerleave", onLeave);
		const onVis = () => {
			if (document.hidden) cancelAnimationFrame(raf);
			else {
				last = 0;
				raf = requestAnimationFrame(loop);
			}
		};
		document.addEventListener("visibilitychange", onVis);
		raf = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			host.removeEventListener("pointermove", onMove);
			host.removeEventListener("pointerleave", onLeave);
			document.removeEventListener("visibilitychange", onVis);
		};
	}, [colors, reduce]);

	return <canvas ref={ref} className="hero-field" aria-hidden="true" />;
}
