import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Source } from "../engine/state";
import type { JobStatus } from "../types";
import { hrefFor, type Page } from "../lib/route";

export type Stage = "hall" | "plan" | "floor" | "signoff";

/** What the top rail needs to know about the current run. `null` means no run is open. */
export type RailJob = { status: JobStatus; source: Source; reviewReady: boolean } | null;

const STATUS_LABEL: Record<JobStatus, string> = {
	planning: "Planning",
	awaiting_budget: "Budget check",
	hiring: "Hiring",
	working: "Building",
	merging: "Merging",
	awaiting_signoff: "Waiting for review",
	paying: "Paying out",
	closed: "Finished",
	failed: "Failed",
};

export function Logo() {
	return (
		<svg className="logo-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
			<rect width="32" height="32" rx="8" fill="#0F1826" />
			<path d="M7 16h8M15 16c4 0 3-7 10-7M15 16h10M15 16c4 0 3 7 10 7" fill="none" stroke="#F6821F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="7" cy="16" r="2.6" fill="#F7F8F9" />
		</svg>
	);
}

const ICON: Record<string, ReactNode> = {
	lend: <path d="M2.5 9.5h3l2.5 2h3.5a1.2 1.2 0 0 0 0-2.4H9M2.5 13.5h7l4-3M8 2.5v4M6 4.5h4" />,
	repo: <path d="M3 3.5h8a2 2 0 0 1 2 2V13H5a2 2 0 0 1-2-2zM3 11h10" />,
	command: <path d="M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3" />,
	review: <path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8zM8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z" />,
	hall: <path d="M2.5 13.5v-1.2A3 3 0 0 1 5.5 9.300h0a3 3 0 0 1 3 3v1.2M7 5.200a2.200 2.200 0 1 1-4.400 0 2.200 2.200 0 0 1 4.400 0zM10.500 9.600a3 3 0 0 1 3 2.700v1.200M10 3.200a2.200 2.200 0 0 1 0 4.200" />,
	gadgets: <path d="M10.500 2.500a3.200 3.200 0 0 0-3.600 4.100L2.800 10.700a1.400 1.400 0 0 0 2 2L8.900 8.600a3.200 3.200 0 0 0 4.100-3.600L11 7 9.300 6.700 9 5z" />,
	docs: <path d="M3 3h4a1.500 1.500 0 0 1 1.500 1.500V13A1.300 1.300 0 0 0 7.200 11.700H3zM13 3H9a1.500 1.500 0 0 0-1.500 1.500V13a1.300 1.300 0 0 1 1.300-1.300H13z" />,
	film: <path d="M5 3l8 5-8 5z" />,
};

function Icon({ k }: { k: string }) {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			{ICON[k]}
		</svg>
	);
}

type Item = { id: string; label: string; sub?: string; live?: boolean };

export function Header({ page, onJobScreen, job, source, fellBack, connected, paymentsMode, onNav, onCommand, onReview, onFilm }: { page: Page; onJobScreen: boolean; job: RailJob; source: Source | "boot"; fellBack: boolean; connected: boolean; paymentsMode?: string; onNav: (p: Page) => void; onCommand: () => void; onReview: () => void; onTerms?: () => void; onFilm: () => void }) {
	const [open, setOpen] = useState(false);
	const bar = useRef<HTMLElement>(null);
	const reviewOn = !!job && (job.reviewReady || ["awaiting_signoff", "paying", "closed"].includes(job.status));
	const live = !!job && !["closed", "failed"].includes(job.status);

	useEffect(() => {
		if (!open) return;
		const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		const away = (e: MouseEvent) => bar.current && !bar.current.contains(e.target as Node) && setOpen(false);
		document.addEventListener("keydown", key);
		document.addEventListener("mousedown", away);
		return () => {
			document.removeEventListener("keydown", key);
			document.removeEventListener("mousedown", away);
		};
	}, [open]);

	const items: Item[] = [
		{ id: "repo", label: "Repo" },
		{ id: "command", label: "Command center", sub: job ? STATUS_LABEL[job.status] : "No run yet", live },
		{ id: "review", label: "Review", sub: reviewOn ? "Ready" : "Nothing yet" },
		{ id: "hall", label: "Hall" },
		{ id: "lend", label: "Lend" },
		{ id: "gadgets", label: "Gadgets" },
		{ id: "docs", label: "Docs" },
		{ id: "film", label: "Film" },
	];
	const currentLabel = onJobScreen ? "Command center" : { repo: "Repo", hall: "Hall", lend: "Lend", gadgets: "Gadgets", docs: "Docs" }[page];
	const pick = (fn: () => void) => () => {
		setOpen(false);
		fn();
	};

	return (
		<header className="topbar" ref={bar}>
			<div className="wrap fyr">
				<a className="brand" href={hrefFor("repo")} onClick={(e) => (e.preventDefault(), pick(() => onNav("repo"))())} aria-label="Forkyard, home">
					<Logo />
					<span>Forkyard</span>
				</a>
				<span className="fyr-here" aria-hidden="true">
					{currentLabel}
				</span>
				<button className="fyr-menu" aria-expanded={open} aria-controls="fyr-nav" onClick={() => setOpen((o) => !o)}>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
						<path d={open ? "M3 3l10 10M13 3L3 13" : "M2 4h12M2 8h12M2 12h12"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
					</svg>
					Menu
				</button>
				<nav id="fyr-nav" className={`fyr-nav ${open ? "open" : ""}`} aria-label="Main">
					{items.map((it) => {
						const common = { className: "fyr-item", "data-id": it.id } as const;
						const body = (
							<>
								<Icon k={it.id} />
								<span className="fyr-txt">
									<span className="fyr-label">{it.label}</span>
									{it.sub && (
										<small className="fyr-sub">
											{it.live && <i className="dot live" aria-hidden="true" />}
											{it.sub}
										</small>
									)}
								</span>
							</>
						);
						if (it.id === "command" || it.id === "review") {
							const on = it.id === "command" ? !!job : reviewOn;
							return (
								<button key={it.id} {...common} aria-disabled={!on} aria-current={it.id === "command" && onJobScreen ? "page" : undefined} title={on ? undefined : it.id === "command" ? "Opens once you watch or start a run." : "Opens when a run has something to review."} onClick={on ? pick(it.id === "command" ? onCommand : onReview) : undefined}>
									{body}
								</button>
							);
						}
						if (it.id === "film")
							return (
								<button key={it.id} {...common} onClick={pick(onFilm)}>
									{body}
								</button>
							);
						const p = it.id as Page;
						return (
							<a key={it.id} {...common} href={hrefFor(p)} aria-current={!onJobScreen && page === p ? "page" : undefined} onClick={(e) => (e.preventDefault(), pick(() => onNav(p))())}>
								{body}
							</a>
						);
					})}
				</nav>
				<div className="badges">
					{source !== "boot" && source !== "live" && (
						<span className="chip warn" title={fellBack ? "The API did not answer, so this is scripted demo data." : "Scripted data, no API calls."}>
							{source === "replay" ? "Replay" : "Demo data"}
						</span>
					)}
					{source === "live" && !connected && <span className="chip bad">Reconnecting</span>}
					{paymentsMode && <span className="chip mono lbl-d">{paymentsMode === "x402" ? "x402 · Base Sepolia" : "payments simulated"}</span>}
				</div>
			</div>
		</header>
	);
}
