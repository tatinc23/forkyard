import { useState } from "react";
import { Avatar } from "../Avatar";
import { REPO } from "../../data/repo";
import { compact } from "../../lib/format";
import type { Agent } from "../../types";
import { hrefFor, type RepoTab } from "../../lib/route";

const TAB_LABEL: Record<RepoTab, string> = { overview: "Overview", code: "Code", contracts: "Contracts", history: "History", crew: "Crew", insights: "Insights" };

export function RepoHeader({ crew, tab, counts, onPost }: { crew: Agent[]; tab: RepoTab; counts: Partial<Record<RepoTab, number>>; onPost: () => void }) {
	const [starred, setStarred] = useState(false);
	return (
		<header className="repo-head">
			<div className="rh-top">
				<div className="rh-title">
					<svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true" className="repo-ico">
						<path d="M2.5 2.5h8a2 2 0 0 1 2 2v9h-8a2 2 0 0 1-2-2zM2.5 11.5h10M5 5.5h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					<h1>
						<span className="rh-owner">{REPO.owner}</span>
						<span className="sl"> / </span>
						<strong>{REPO.name}</strong>
					</h1>
					<span className="chip">Public</span>
					<span className="chip mono" title="Demo repo for the hackathon. Contracts, previews and payouts are real; star, watch and the Insights charts are mock.">
						demo
					</span>
				</div>
				<div className="rh-actions">
					<button className="btn-sm" onClick={() => setStarred((s) => !s)} aria-pressed={starred}>
						<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
							<path d="M8 1.6l2 4.2 4.6.6-3.4 3.2.9 4.5L8 11.7 3.9 14l.9-4.5L1.4 6.4 6 5.8z" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
						</svg>
						Star <span className="count num">{compact(REPO.stars + (starred ? 1 : 0))}</span>
					</button>
					<button className="btn-sm" type="button" title="Watch this repo for new contracts">
						Watch <span className="count num">{REPO.watchers}</span>
					</button>
					<button className="btn orange post-cta" onClick={onPost}>
						<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
							<path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
						</svg>
						Post a job
					</button>
				</div>
			</div>
			<p className="rh-desc">{REPO.description}</p>
			<div className="rh-meta">
				<span className="avstack" aria-label={`${crew.length} agents on the crew`}>
					{crew.slice(0, 6).map((a) => (
						<Avatar key={a.id} seed={a.glyph} color={a.color} size={26} label={a.name} />
					))}
				</span>
				<span className="rh-small">
					{crew.length} on the crew · {REPO.hires} hires to date · deploys to <span className="mono">{REPO.site}</span>
				</span>
			</div>
			<nav className="repo-tabs" aria-label="Repository">
				{(Object.keys(TAB_LABEL) as RepoTab[]).map((t) => (
					<a key={t} href={hrefFor(t)} aria-current={tab === t ? "page" : undefined}>
						{TAB_LABEL[t]}
						{counts[t] != null && <span className="count num">{counts[t]}</span>}
					</a>
				))}
			</nav>
		</header>
	);
}
