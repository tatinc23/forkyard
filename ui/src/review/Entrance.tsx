import { useEffect, useRef } from "react";

export type Brick = { id: string; label: string; fill: string; text: string };

/**
 * The hand-off from the Floor. The merged bricks settle into a stack, then the stack's frame
 * "opens" and grows until it IS the live site on the page underneath: one continuous motion, no page change.
 * The frame is a hole in a huge box-shadow, so the real review page shows through as it expands.
 */
export function Entrance({ bricks, onDone, caption }: { bricks: Brick[]; onDone: () => void; caption: string }) {
	const iris = useRef<HTMLDivElement>(null);
	const cap = useRef<HTMLParagraphElement>(null);
	const stack = useRef<HTMLDivElement>(null);
	const finished = useRef(false);
	const anims = useRef<Animation[]>([]);

	useEffect(() => {
		const root = document.querySelector("[data-rv-root]");
		root?.scrollIntoView({ block: "start" });
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		let dead = false;
		const done = () => {
			if (finished.current) return;
			finished.current = true;
			anims.current.forEach((a) => a.cancel());
			document.body.style.overflow = prev;
			onDone();
		};
		const settle = bricks.length * 150 + 750;
		const t = setTimeout(async () => {
			if (dead) return;
			const el = iris.current;
			const hero = document.querySelector("[data-rv-hero] .cmp-stage") as HTMLElement | null;
			if (!el || !hero) return done();
			const r = hero.getBoundingClientRect();
			const a = el.animate(
				[
					{ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height, borderRadius: "14px", backgroundColor: "#f7f8f9" },
					{ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: "10px", backgroundColor: "rgba(247,248,249,0)" },
				],
				{ duration: 820, easing: "cubic-bezier(0.65, 0, 0.2, 1)", fill: "forwards" },
			);
			const c = cap.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" });
			const s = stack.current?.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.9)" }], { duration: 380, fill: "forwards" });
			anims.current = [a, ...(c ? [c] : []), ...(s ? [s] : [])];
			await a.finished.catch(() => undefined);
			if (!dead) done();
		}, settle);
		const skip = (e: Event) => {
			if (e.type === "keydown") {
				const k = (e as KeyboardEvent).key;
				if (!["Escape", "Enter", " "].includes(k)) return;
			}
			done();
		};
		window.addEventListener("keydown", skip);
		return () => {
			dead = true;
			clearTimeout(t);
			window.removeEventListener("keydown", skip);
			document.body.style.overflow = prev;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const w = 232;
	const h = bricks.length * 44 + 36;
	const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
	const vh = typeof window !== "undefined" ? window.innerHeight : 800;

	return (
		<div className="rv-intro" onClick={() => { finished.current = false; anims.current.forEach((a) => a.cancel()); document.body.style.overflow = ""; finished.current = true; onDone(); }} role="presentation">
			<div ref={iris} className="rv-iris" style={{ left: (vw - w) / 2, top: (vh - h) / 2 - 24, width: w, height: h }} />
			<div className="rv-intro-in" style={{ top: (vh - h) / 2 - 24, height: h }}>
				<div className="rv-stack" ref={stack} aria-hidden="true">
					{[...bricks].reverse().map((b, i) => (
						<span key={b.id} className="rv-brick" style={{ background: b.fill, color: b.text, animationDelay: `${(bricks.length - 1 - i) * 150}ms` }}>
							{b.label}
						</span>
					))}
				</div>
			</div>
			<p ref={cap} className="rv-intro-cap" style={{ top: (vh + h) / 2 + 4 }}>
				{caption} <span>Click to skip.</span>
			</p>
		</div>
	);
}
