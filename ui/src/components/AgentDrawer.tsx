import type { Agent } from "../types";
import { Avatar } from "./Avatar";
import { Drawer } from "./Overlay";
import { TierMark, TIER_HELP, TIER_LABEL } from "./Tier";
import { TrackRecord } from "./TrackRecord";
import { GadgetCard, type Offer } from "./Gadgets";
import type { GadgetListing } from "../data/gadgets";
import { usdc } from "../lib/format";

/** Agent profile: stats, track record, edge and the Gadgets it brings. */
export function AgentDrawer({ agent, onClose, onGadget, onHire }: { agent: Agent | null; onClose: () => void; onGadget: (l: GadgetListing, o: Offer) => void; onHire: () => void }) {
	const tier = agent?.tier ?? "standard";
	const pct = agent && agent.stats.contracts ? Math.round((agent.stats.merged / agent.stats.contracts) * 100) : 0;
	return (
		<Drawer open={!!agent} onClose={onClose} label={agent ? `${agent.name}'s profile` : "Agent profile"} wide title={agent ? <h2>Agent profile</h2> : null}>
			{agent && (
				<div className={`aprofile tier-${tier}`}>
					<header className="ap-head">
						<Avatar seed={agent.glyph} color={agent.color} size={72} label={agent.name} />
						<div>
							<h3>
								{agent.name} <TierMark tier={agent.tier} size={20} />
							</h3>
							<span className="mono hint">{agent.handle}</span>
							<p className="ap-chips">
								{agent.role && <span className="chip role">{agent.role}</span>}
								<span className="chip">{agent.provider === "byo" ? "Bring your own" : agent.provider === "house" ? "House service" : "In the Hall"}</span>
								{tier !== "standard" && <span className={`chip tier-chip ${tier}`}>{TIER_LABEL[tier]}</span>}
							</p>
						</div>
					</header>
					<p className="ap-spec">{agent.specialty}</p>
					{agent.edge && (
						<div className={`edge-card ${tier}`}>
							<strong>The edge</strong>
							<p>{agent.edge}</p>
							<small>{TIER_HELP[tier]}</small>
						</div>
					)}
					<dl className="stat-grid">
						<div>
							<dt>Reputation</dt>
							<dd className="num big">{agent.reputation}</dd>
						</div>
						<div>
							<dt>Price</dt>
							<dd className="num big">{usdc(agent.rate)}</dd>
							<small>USDC per contract</small>
						</div>
						<div>
							<dt>Merged</dt>
							<dd className="num big">{pct}%</dd>
							<small>
								{agent.stats.merged} of {agent.stats.contracts}
							</small>
						</div>
						<div>
							<dt>Avg inspection</dt>
							<dd className="num big">{agent.stats.avgReview.toFixed(1)}</dd>
							<small>out of 5</small>
						</div>
						<div>
							<dt>Conflicts caused</dt>
							<dd className="num big">{agent.stats.conflicts}</dd>
						</div>
						<div>
							<dt>Earned</dt>
							<dd className="num big">{usdc(agent.stats.earned)}</dd>
							<small>USDC</small>
						</div>
					</dl>
					<section>
						<h4>Track record</h4>
						<TrackRecord agent={agent} max={40} />
						<p className="hint">Each tick is one contract: dark merged clean, orange merged after a conflict, outline not merged.</p>
					</section>
					<section>
						<h4>Skills</h4>
						<p className="tags">
							{agent.tags.map((t) => (
								<span key={t} className="chip mono">
									{t}
								</span>
							))}
						</p>
					</section>
					<section>
						<h4>
							Gadgets <span className="count num">{agent.gadgets?.length ?? 0}</span>
						</h4>
						{agent.gadgets && agent.gadgets.length > 0 ? (
							<div className="gadget-list">
								{agent.gadgets.map((g) => (
									<GadgetCard key={g.id} l={{ gadget: g, owner: agent }} onAction={onGadget} compactMode />
								))}
							</div>
						) : (
							<p className="empty">{agent.name} brings no Gadgets yet. Agents with their own tools can lend, sell or gift them.</p>
						)}
					</section>
					{agent.provider !== "house" && (
						<div className="ap-cta">
							<button className="btn orange" onClick={onHire}>
								Post a job for {agent.name}
							</button>
							<p className="hint">Foreman hires from the Hall per contract, so this opens the job form.</p>
						</div>
					)}
				</div>
			)}
		</Drawer>
	);
}
