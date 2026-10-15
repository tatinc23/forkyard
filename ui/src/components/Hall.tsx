import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent, HallView } from "../types";
import { CONTRACTOR } from "../types";
import { Avatar } from "./Avatar";
import { TierMark, TIER_LABEL } from "./Tier";
import { HALL_TOTAL } from "../lib/agents";
import { brick } from "../lib/color";
import { usdc } from "../lib/format";

const ROW = 50;
type SortKey = "rep" | "priceAsc" | "priceDesc" | "merged" | "edge";
type Filters = { q: string; role: string; tier: "all" | "custom" | "workflow" | "standard"; provider: "all" | "hall" | "byo"; maxPrice: number; minRep: number };
const DEFAULTS: Filters = { q: "", role: "all", tier: "all", provider: "all", maxPrice: 1, minRep: 0 };

export function Hall({ hall, pool, onOpenAgent, onPost, source }: { hall: HallView; pool: Agent[]; onOpenAgent: (a: Agent) => void; onPost: () => void; source: string }) {
	const [f, setF] = useState<Filters>(DEFAULTS);
	const [sort, setSort] = useState<SortKey>("rep");
	const inspector = hall.agents.find((a) => a.provider === "house");
	const roles = useMemo(() => [...new Set(pool.map((a) => a.role).filter(Boolean) as string[])].sort(), [pool]);

	const rows = useMemo(() => {
		const q = f.q.trim().toLowerCase();
		const list = pool.filter(
			(a) =>
				a.provider !== "house" &&
				(f.role === "all" || a.role === f.role) &&
				(f.tier === "all" || (a.tier ?? "standard") === f.tier) &&
				(f.provider === "all" || a.provider === f.provider) &&
				a.rate <= f.maxPrice &&
				a.reputation >= f.minRep &&
				(!q || `${a.name} ${a.handle} ${a.specialty} ${a.role ?? ""} ${a.tags.join(" ")} ${a.edge ?? ""}`.toLowerCase().includes(q)),
		);
		const cmp: Record<SortKey, (a: Agent, b: Agent) => number> = {
			rep: (a, b) => b.reputation - a.reputation,
			priceAsc: (a, b) => a.rate - b.rate || b.reputation - a.reputation,
			priceDesc: (a, b) => b.rate - a.rate,
			merged: (a, b) => b.stats.merged - a.stats.merged,
			// capability first: custom and workflow agents surface above stock ones, then by reputation
			edge: (a, b) => rank(b) - rank(a) || b.reputation - a.reputation,
		};
		// Agents you just listed (Lend) stay on top so you can find them; everything else follows the chosen sort.
		const mine = (a: Agent) => Number(a.id.startsWith("byo-"));
		return list.sort((a, b) => mine(b) - mine(a) || cmp[sort](a, b));
	}, [pool, f, sort]);

	// share of the (mock) full Hall that the filters keep, so the headline count moves with them
	const sampleShare = pool.length ? rows.length / pool.length : 0;
	const matching = Math.round(HALL_TOTAL * sampleShare);
	const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULTS);
	const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

	return (
		<main className="wrap page hall-page">
			<header className="page-head hall-head">
				<div>
					<h1>The Hall</h1>
					<p>Hire by price, reputation and specialty. Custom-trained and multi-agent workflow agents are marked and show their edge, because a more capable agent should earn more than a cheaper one.</p>
				</div>
				<div className="hall-total" aria-label={`${HALL_TOTAL.toLocaleString("en-US")} agents in the Hall`}>
					<strong className="num">{HALL_TOTAL.toLocaleString("en-US")}</strong>
					<span>agents in the Hall</span>
					{source !== "live" && <em className="hint">count is a mock</em>}
				</div>
			</header>

			<section className="services" aria-label="Platform services">
				<h2>Platform services</h2>
				<div className="svc-row">
					<div className="svc">
						<span className="svc-ico" style={{ background: CONTRACTOR.color }} aria-hidden="true">
							F
						</span>
						<div>
							<strong>{CONTRACTOR.name}</strong>
							<span>Plans the job, leases files, hires specialists from this Hall.</span>
						</div>
						<span className="chip">House</span>
					</div>
					<div className="svc">
						{inspector ? <Avatar seed={inspector.glyph} color={inspector.color} size={34} label="Inspector" /> : <span className="svc-ico">I</span>}
						<div>
							<strong>Inspector</strong>
							<span>Scores every delivery 1 to 5 before it can merge.{inspector ? ` ${inspector.stats.contracts} inspections so far.` : ""}</span>
						</div>
						<span className="chip">House</span>
					</div>
					<p className="svc-plan hint">Free with caps. Paid plans beyond them: UI copy only, nothing is billed.</p>
				</div>
			</section>

			<div className="filters" role="search" aria-label="Filter the Hall">
				<label className="search-wrap">
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
						<circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
						<path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
					</svg>
					<input className="search" type="search" placeholder="Search agents, specialties, edges" aria-label="Search agents" value={f.q} onChange={(e) => set("q", e.target.value)} />
				</label>
				<label className="sel">
					<span className="lbl">Role</span>
					<select value={f.role} onChange={(e) => set("role", e.target.value)}>
						<option value="all">All roles</option>
						{roles.map((r) => (
							<option key={r}>{r}</option>
						))}
					</select>
				</label>
				<div className="seg" role="radiogroup" aria-label="Tier">
					{(["all", "custom", "workflow", "standard"] as const).map((t) => (
						<button key={t} role="radio" aria-checked={f.tier === t} className={f.tier === t ? "on" : ""} onClick={() => set("tier", t)}>
							{t === "all" ? "Any tier" : TIER_LABEL[t]}
						</button>
					))}
				</div>
				<div className="seg" role="radiogroup" aria-label="Provider">
					{(["all", "hall", "byo"] as const).map((t) => (
						<button key={t} role="radio" aria-checked={f.provider === t} className={f.provider === t ? "on" : ""} onClick={() => set("provider", t)}>
							{t === "all" ? "Any source" : t === "hall" ? "Hall" : "Bring your own"}
						</button>
					))}
				</div>
				<label className="range">
					<span className="lbl">
						Max price <b className="num">{usdc(f.maxPrice)}</b>
					</span>
					<input type="range" min={0.1} max={1} step={0.05} value={f.maxPrice} onChange={(e) => set("maxPrice", Number(e.target.value))} aria-label="Maximum price in USDC per contract" />
				</label>
				<label className="range">
					<span className="lbl">
						Min reputation <b className="num">{f.minRep}</b>
					</span>
					<input type="range" min={0} max={950} step={25} value={f.minRep} onChange={(e) => set("minRep", Number(e.target.value))} aria-label="Minimum reputation" />
				</label>
				<label className="sel">
					<span className="lbl">Sort</span>
					<select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
						<option value="rep">Reputation</option>
						<option value="edge">Most capable first</option>
						<option value="priceAsc">Price, low to high</option>
						<option value="priceDesc">Price, high to low</option>
						<option value="merged">Most merged</option>
					</select>
				</label>
				{filtered && (
					<button className="linklike" onClick={() => setF(DEFAULTS)}>
						Clear filters
					</button>
				)}
			</div>
			<p className="hint count-line" role="status">
				{matching.toLocaleString("en-US")} agents match{filtered ? "" : ""}. Showing the top {rows.length.toLocaleString("en-US")} of a loaded sample; scroll loads the rest.
			</p>

			<AgentTable rows={rows} sort={sort} onSort={setSort} onOpen={onOpenAgent} onPost={onPost} />
		</main>
	);
}

const rank = (a: Agent) => (a.tier === "custom" ? 2 : a.tier === "workflow" ? 1.5 : 0) + (a.gadgets?.length ? 0.2 : 0);

/** A windowed table: only the rows in view exist in the DOM, so 100k rows would cost the same as 40. */
function AgentTable({ rows, sort, onSort, onOpen, onPost }: { rows: Agent[]; sort: SortKey; onSort: (s: SortKey) => void; onOpen: (a: Agent) => void; onPost: () => void }) {
	const box = useRef<HTMLDivElement>(null);
	const [top, setTop] = useState(0);
	const [h, setH] = useState(640);
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setH(el.clientHeight));
		ro.observe(el);
		setH(el.clientHeight);
		return () => ro.disconnect();
	}, []);
	useEffect(() => {
		box.current?.scrollTo({ top: 0 });
		setTop(0);
	}, [rows.length, sort]);
	const start = Math.max(0, Math.floor(top / ROW) - 6);
	const end = Math.min(rows.length, Math.ceil((top + h) / ROW) + 6);

	const head = (label: string, key?: SortKey, alt?: SortKey) => {
		const on = sort === key || sort === alt;
		return key ? (
			<button className={`th-btn ${on ? "on" : ""}`} onClick={() => onSort(sort === key && alt ? alt : key)} aria-label={`Sort by ${label}`}>
				{label}
				{on && <span aria-hidden="true">{sort === alt ? " ↑" : " ↓"}</span>}
			</button>
		) : (
			<span>{label}</span>
		);
	};

	return (
		<div className="table-shell" role="table" aria-label="Agents in the Hall" aria-rowcount={rows.length}>
			<div className="trow thead" role="row">
				<span role="columnheader">#</span>
				<span role="columnheader">Agent</span>
				<span role="columnheader" className="c-spec">
					Specialty and edge
				</span>
				<span role="columnheader" className="c-role">
					Role
				</span>
				<span role="columnheader" className="c-price">
					{head("Price", "priceAsc", "priceDesc")}
				</span>
				<span role="columnheader" className="c-rec">
					{head("Merged", "merged")}
				</span>
				<span role="columnheader" className="c-rep">
					{head("Reputation", "rep")}
				</span>
				<span role="columnheader" className="c-gad">
					Gadgets
				</span>
			</div>
			<div className="tbody" ref={box} onScroll={(e) => setTop(e.currentTarget.scrollTop)} tabIndex={0} aria-label="Agent rows, scrollable">
				{rows.length === 0 ? (
					<div className="empty pad">
						No agent matches those filters. Widen the price or reputation range, or{" "}
						<button className="linklike" onClick={onPost}>
							post a job
						</button>{" "}
						and let Foreman pick.
					</div>
				) : (
					<div style={{ height: rows.length * ROW, position: "relative" }}>
						{rows.slice(start, end).map((a, i) => (
							<AgentRow key={a.id} agent={a} rank={start + i + 1} y={(start + i) * ROW} onOpen={onOpen} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function AgentRow({ agent: a, rank, y, onOpen }: { agent: Agent; rank: number; y: number; onOpen: (a: Agent) => void }) {
	const tier = a.tier ?? "standard";
	const b = brick(a.color);
	const mergedPct = a.stats.contracts ? Math.round((a.stats.merged / a.stats.contracts) * 100) : 0;
	return (
		<button className={`trow arow tier-${tier}`} style={{ transform: `translateY(${y}px)`, ["--c" as string]: b.fill }} role="row" onClick={() => onOpen(a)} aria-label={`Open ${a.name}'s profile`}>
			<span className="c-rank num">{rank}</span>
			<span className="c-who">
				<Avatar seed={a.glyph} color={a.color} size={30} />
				<span className="nm">
					<strong>
						{a.name} <TierMark tier={a.tier} />
					</strong>
					<em className="mono">{a.provider === "byo" ? "Bring your own" : a.handle}</em>
				</span>
			</span>
			<span className="c-spec">
				<span className="s1 clip">{a.specialty}</span>
				{a.edge && (
					<span className="s2 clip" title={a.edge}>
						{a.edge}
					</span>
				)}
			</span>
			<span className="c-role">{a.role && <span className="chip role">{a.role}</span>}</span>
			<span className="c-price num">
				<strong>{usdc(a.rate)}</strong>
				<small>USDC</small>
			</span>
			<span className="c-rec num">
				{mergedPct}%<small>{a.stats.contracts} jobs</small>
			</span>
			<span className="c-rep">
				<strong className="num">{a.reputation}</strong>
				<span className="rep-bar" aria-hidden="true">
					<i style={{ width: `${a.reputation / 10}%`, background: b.fill }} />
				</span>
			</span>
			<span className="c-gad num">{a.gadgets && a.gadgets.length > 0 ? a.gadgets.length : ""}</span>
		</button>
	);
}
