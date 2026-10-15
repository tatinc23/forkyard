import { useMemo, useState } from "react";
import type { Agent, Gadget } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Overlay";
import { KIND_HELP, KIND_LABEL, type GadgetListing } from "../data/gadgets";
import { compact, usdc } from "../lib/format";

export function KindIcon({ kind, size = 22 }: { kind: Gadget["kind"]; size?: number }) {
	const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
	switch (kind) {
		case "tool":
			return (
				<svg {...p}>
					<path d="M14.5 4.5a4.5 4.5 0 0 0-5.4 5.7L3.5 15.8a1.9 1.9 0 0 0 2.7 2.7l5.6-5.6a4.5 4.5 0 0 0 5.7-5.4l-2.6 2.6-2.2-.4-.4-2.2z" />
				</svg>
			);
		case "mcp":
			return (
				<svg {...p}>
					<rect x="3.5" y="4" width="17" height="6" rx="1.5" />
					<rect x="3.5" y="14" width="17" height="6" rx="1.5" />
					<path d="M7 7h.01M7 17h.01" />
				</svg>
			);
		case "dataset":
			return (
				<svg {...p}>
					<ellipse cx="12" cy="6" rx="7.5" ry="3" />
					<path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
				</svg>
			);
		case "workflow":
			return (
				<svg {...p}>
					<circle cx="5.5" cy="6" r="2" />
					<circle cx="18.5" cy="12" r="2" />
					<circle cx="5.5" cy="18" r="2" />
					<path d="M7.3 7l9.4 4M7.3 17l9.4-4" />
				</svg>
			);
		case "model":
			return (
				<svg {...p}>
					<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
					<path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
				</svg>
			);
	}
}

export type Offer = "lend" | "sell" | "gift";
const OFFER_LABEL: Record<Offer, string> = { lend: "Borrow", sell: "Buy", gift: "Gift" };

export function GadgetCard({ l, onAction, compactMode }: { l: GadgetListing; onAction: (l: GadgetListing, o: Offer) => void; compactMode?: boolean }) {
	const { gadget: g, owner } = l;
	const offers: [Offer, string][] = [
		["lend", g.terms.lend != null ? `${usdc(g.terms.lend)}/contract` : ""],
		["sell", g.terms.sell != null ? `${usdc(g.terms.sell)} USDC` : ""],
		["gift", g.terms.gift ? "free" : ""],
	];
	return (
		<article className={`gadget ${compactMode ? "tight" : ""}`} data-kind={g.kind}>
			<header>
				<span className="gk" title={KIND_HELP[g.kind]}>
					<KindIcon kind={g.kind} />
				</span>
				<div>
					<h3>{g.name}</h3>
					<span className="hint">{KIND_LABEL[g.kind]}</span>
				</div>
				<span className="uses num" title="Times used on a contract">
					{compact(g.uses)} <small>uses</small>
				</span>
			</header>
			<p className="gdesc">{g.description}</p>
			{!compactMode && (
				<div className="g-owner">
					<Avatar seed={owner.glyph} color={owner.color} size={20} />
					<span>
						Owned by <strong>{owner.name}</strong>
					</span>
				</div>
			)}
			<div className="offers" role="group" aria-label={`Offers for ${g.name}`}>
				{offers.map(([o, price]) => (
					<button key={o} className={`offer ${o}`} disabled={!price} onClick={() => onAction(l, o)} title={price ? undefined : "Not offered by the owner"}>
						<strong>{OFFER_LABEL[o]}</strong>
						<small className="num">{price || "n/a"}</small>
					</button>
				))}
			</div>
		</article>
	);
}

/** UI-only confirm. The copy says "simulated" because no money or tool actually moves in the hackathon build. */
export function GadgetModal({ pick, onClose }: { pick: { l: GadgetListing; o: Offer } | null; onClose: () => void }) {
	const [done, setDone] = useState(false);
	const [uses, setUses] = useState(1);
	const g = pick?.l.gadget;
	const owner = pick?.l.owner;
	const o = pick?.o;
	const price = useMemo(() => (!g || !o ? 0 : o === "lend" ? (g.terms.lend ?? 0) * uses : o === "sell" ? (g.terms.sell ?? 0) : 0), [g, o, uses]);
	const close = () => {
		setDone(false);
		setUses(1);
		onClose();
	};
	return (
		<Modal open={!!pick} onClose={close} label={g && o ? `${OFFER_LABEL[o]} ${g.name}` : "Gadget"} size="sm">
			{g && owner && o && (
				<div className="gmodal">
					{!done ? (
						<>
							<h2>
								{OFFER_LABEL[o]} {g.name}
							</h2>
							<p className="ov-lede">
								{o === "lend" && `${owner.name} lends it to your crew for the length of a contract. It goes back when the contract ends.`}
								{o === "sell" && `${owner.name} sells it outright. It joins your crew's toolbox for every future job.`}
								{o === "gift" && `${owner.name} gives it away free. It joins your crew's toolbox.`}
							</p>
							{o === "lend" && (
								<label className="field">
									<span>Contracts to cover</span>
									<input className="num" type="number" min={1} max={20} value={uses} onChange={(e) => setUses(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} data-autofocus />
								</label>
							)}
							<dl className="kv">
								<div>
									<dt>From</dt>
									<dd>
										<Avatar seed={owner.glyph} color={owner.color} size={20} /> {owner.name}
									</dd>
								</div>
								<div>
									<dt>Total</dt>
									<dd className="num">{o === "gift" ? "Free" : `${usdc(price)} USDC`}</dd>
								</div>
							</dl>
							<p className="hint">This is a simulation. No funds move and no tool is transferred in the hackathon build.</p>
							<div className="modal-actions">
								<button className="btn ghost" onClick={close}>
									Cancel
								</button>
								<button className="btn orange" onClick={() => setDone(true)} data-autofocus={o !== "lend" ? true : undefined}>
									{o === "gift" ? "Accept the gift (simulated)" : `${OFFER_LABEL[o]} (simulated)`}
								</button>
							</div>
						</>
					) : (
						<>
							<h2>Simulated: {g.name} is on your crew</h2>
							<p className="ov-lede">
								{o === "lend" ? `Borrowed for ${uses} contract${uses > 1 ? "s" : ""}.` : o === "sell" ? "Purchased." : "Gift accepted."} Nothing was charged. In the full product this settles in USDC on Base Sepolia through x402, and the Gadget appears in your crew's toolbox.
							</p>
							<div className="modal-actions">
								<button className="btn orange" onClick={close} data-autofocus>
									Done
								</button>
							</div>
						</>
					)}
				</div>
			)}
		</Modal>
	);
}

export function Gadgets({ items, onAction, onAgent }: { items: GadgetListing[]; onAction: (l: GadgetListing, o: Offer) => void; onAgent: (a: Agent) => void }) {
	const [kind, setKind] = useState<Gadget["kind"] | "all">("all");
	const [offer, setOffer] = useState<Offer | "all">("all");
	const [q, setQ] = useState("");
	const [sort, setSort] = useState<"uses" | "price">("uses");
	const list = useMemo(() => {
		const f = items.filter(({ gadget: g, owner }) => (kind === "all" || g.kind === kind) && (offer === "all" || (offer === "lend" ? g.terms.lend != null : offer === "sell" ? g.terms.sell != null : !!g.terms.gift)) && (!q || `${g.name} ${g.description} ${owner.name}`.toLowerCase().includes(q.toLowerCase())));
		return f.sort((a, b) => (sort === "uses" ? b.gadget.uses - a.gadget.uses : (a.gadget.terms.sell ?? a.gadget.terms.lend ?? 0) - (b.gadget.terms.sell ?? b.gadget.terms.lend ?? 0)));
	}, [items, kind, offer, q, sort]);

	return (
		<main className="wrap page">
			<header className="page-head">
				<h1>Gadgets</h1>
				<p>Agents bring their own tools. Your crew can borrow a Gadget for a contract, buy it, or take it as a gift. The more capable the toolbox, the better the agent bids.</p>
			</header>
			<div className="list-bar">
				<input className="search" type="search" placeholder="Search Gadgets or owners" aria-label="Search Gadgets" value={q} onChange={(e) => setQ(e.target.value)} />
				<div className="seg" role="radiogroup" aria-label="Kind">
					{(["all", "tool", "mcp", "dataset", "workflow", "model"] as const).map((k) => (
						<button key={k} role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
							{k === "all" ? "All" : KIND_LABEL[k]}
						</button>
					))}
				</div>
				<div className="seg" role="radiogroup" aria-label="Offer">
					{(["all", "lend", "sell", "gift"] as const).map((k) => (
						<button key={k} role="radio" aria-checked={offer === k} className={offer === k ? "on" : ""} onClick={() => setOffer(k)}>
							{k === "all" ? "Any offer" : OFFER_LABEL[k]}
						</button>
					))}
				</div>
				<label className="sel">
					<span className="sr-only">Sort</span>
					<select value={sort} onChange={(e) => setSort(e.target.value as "uses" | "price")}>
						<option value="uses">Most used</option>
						<option value="price">Lowest price</option>
					</select>
				</label>
			</div>
			<p className="hint count-line">{list.length} Gadgets. Prices are per contract (Borrow) or one-off (Buy). All transactions are simulated.</p>
			<div className="gadget-grid">
				{list.map((l) => (
					<div key={`${l.owner.id}:${l.gadget.id}`} className="gwrap">
						<GadgetCard l={l} onAction={onAction} />
						<button className="owner-link" onClick={() => onAgent(l.owner)}>
							See {l.owner.name}'s profile
						</button>
					</div>
				))}
				{list.length === 0 && <p className="empty">No Gadgets match those filters.</p>}
			</div>
		</main>
	);
}
