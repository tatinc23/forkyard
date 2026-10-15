import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Shared drawer / modal shell: Escape closes, focus moves in and returns, page scroll is locked while open. */
function useOverlay(open: boolean, onClose: () => void) {
	const panel = useRef<HTMLDivElement>(null);
	// Parents pass a fresh onClose every render; keep it in a ref so focus setup runs only when `open` changes
	// (re-running it on every render bounced focus back to the opener and made inputs impossible to type in).
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	useEffect(() => {
		if (!open) return;
		const prev = document.activeElement as HTMLElement | null;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus], button, a, input")?.focus(), 30);
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") closeRef.current();
			if (e.key === "Tab" && panel.current) {
				const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, textarea, select, video, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
				if (!f.length) return;
				const first = f[0];
				const last = f[f.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};
		document.addEventListener("keydown", key);
		return () => {
			clearTimeout(t);
			document.removeEventListener("keydown", key);
			document.body.style.overflow = prevOverflow;
			prev?.focus?.();
		};
	}, [open]);
	return panel;
}

export function Drawer({ open, onClose, title, children, wide, label }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean; label: string }) {
	const panel = useOverlay(open, onClose);
	return (
		<AnimatePresence>
			{open && (
				<div className="ov-root">
					<motion.div className="ov-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
					<motion.aside ref={panel} className={`drawer ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={label} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}>
						<header className="ov-head">
							<div className="ov-title">{title}</div>
							<button className="icon-btn" onClick={onClose} aria-label="Close">
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
									<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
								</svg>
							</button>
						</header>
						<div className="ov-body">{children}</div>
					</motion.aside>
				</div>
			)}
		</AnimatePresence>
	);
}

export function Modal({ open, onClose, children, label, size = "md" }: { open: boolean; onClose: () => void; children: ReactNode; label: string; size?: "sm" | "md" | "lg" | "xl" }) {
	const panel = useOverlay(open, onClose);
	return (
		<AnimatePresence>
			{open && (
				<div className="ov-root ov-center">
					<motion.div className="ov-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
					<motion.div ref={panel} className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={label} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
						<button className="icon-btn modal-x" onClick={onClose} aria-label="Close">
							<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
								<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
							</svg>
						</button>
						{children}
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
