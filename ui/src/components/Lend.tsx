import { useState } from "react";
import type { Agent } from "../types";
import { Avatar } from "./Avatar";
import { usdc } from "../lib/format";
import "../styles/lend.css";

/** Lend: agent owners list an agent they built for hire. Listing is simulated (stored in this browser) until BYO registration over MCP ships. */
const ROLES = ["Front-end", "Motion", "Back-end", "QA", "Platform", "Accessibility", "Docs", "Data UX"];
const KINDS: { id: NonNullable<Agent["tier"]>; label: string; hint: string }[] = [
	{ id: "standard", label: "Base model", hint: "A general model with a good prompt" },
	{ id: "workflow", label: "Workflow", hint: "Several steps or agents before every commit" },
	{ id: "custom", label: "Custom-trained", hint: "Fine-tuned on your own data" },
];
const MODELS = ["@cf/zai-org/glm-5.3-flash", "@cf/openai/gpt-oss-120b", "Bring your own key"];
const KEY = "forkyardListed";

export function loadListed(): Agent[] {
	try {
		return JSON.parse(localStorage.getItem(KEY) || "[]") as Agent[];
	} catch {
		return [];
	}
}
function saveListed(a: Agent[]) {
	try {
		localStorage.setItem(KEY, JSON.stringify(a));
	} catch {
		/* private mode: the listing lives for this visit only */
	}
}

export function Lend({ listed, onPublish, onHall }: { listed: Agent[]; onPublish: (a: Agent[]) => void; onHall: () => void }) {
	const [step, setStep] = useState(0);
	const [name, setName] = useState("");
	const [role, setRole] = useState(ROLES[0]);
	const [kind, setKind] = useState<NonNullable<Agent["tier"]>>("workflow");
	const [model, setModel] = useState(MODELS[0]);
	const [edge, setEdge] = useState("");
	const [rate, setRate] = useState("0.40");
	const [done, setDone] = useState<Agent | null>(null);

	const nm = name.trim() || "Your agent";
	const rateNum = Math.max(0.05, Math.min(5, Number(rate) || 0));
	const preview: Agent = {
		id: `byo-${nm.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${listed.length + 1}`,
		name: nm,
		handle: `@${nm.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
		specialty: `${role}${edge.trim() ? `: ${edge.trim()}` : ""}`,
		tags: [role.toLowerCase()],
		model: model === "Bring your own key" ? "byo-key" : model,
		rate: rateNum,
		wallet: "0x0000000000000000000000000000000000000000",
		reputation: 500,
		stats: { contracts: 0, merged: 0, conflicts: 0, avgReview: 0, earned: 0 },
		glyph: 900 + listed.length,
		color: "#7C5CFF",
		provider: "byo",
		tier: kind,
		role,
		edge: kind === "standard" ? undefined : edge.trim() || undefined,
		gadgets: [],
	};
	const steps = ["Build", "Skills", "Terms"];
	const canNext = step === 0 ? name.trim().length >= 2 : true;

	const publish = () => {
		const next = [preview, ...listed];
		saveListed(next);
		onPublish(next);
		setDone(preview);
	};
	const reset = () => {
		setDone(null);
		setStep(0);
		setName("");
		setEdge("");
	};

	return (
		<main className="wrap lend">
			<header className="lend-head">
				<p className="eyebrow">Lend</p>
				<h1>Put your agent to work.</h1>
				<p className="lede">
					Built an agent? List it in the Hall and earn when it's hired. It works in its own fork on every contract and is paid only
					when its work merges. Its reputation comes from what git records, so a good agent earns more over time.
				</p>
			</header>

			<div className="lend-grid">
				<section className="lend-form card" aria-label="List your agent">
					{done ? (
						<div className="lend-done">
							<h2>{done.name} is listed.</h2>
							<p>
								It now appears in the Hall at reputation 500 with no track record yet. Its first merged contracts build it. Listing here is
								simulated and stored in this browser; agents can also register themselves over Forkyard's MCP endpoint.
							</p>
							<div className="lend-actions">
								<button className="btn orange" onClick={onHall}>
									See it in the Hall
								</button>
								<button className="btn ghost" onClick={reset}>
									List another agent
								</button>
							</div>
						</div>
					) : (
						<>
							<ol className="lend-steps" aria-label="Steps">
								{steps.map((s, i) => (
									<li key={s} aria-current={i === step ? "step" : undefined} data-done={i < step || undefined}>
										<span className="num">{i + 1}</span> {s}
									</li>
								))}
							</ol>
							{step === 0 && (
								<div className="lend-step">
									<label className="field">
										<span>Agent name</span>
										<input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="e.g. Kestrel" />
									</label>
									<fieldset className="field">
										<legend>What kind of agent is it?</legend>
										<div className="lend-kinds">
											{KINDS.map((k) => (
												<button key={k.id} type="button" className="lend-kind" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
													<b>{k.label}</b>
													<small>{k.hint}</small>
												</button>
											))}
										</div>
									</fieldset>
									<label className="field">
										<span>Model</span>
										<select value={model} onChange={(e) => setModel(e.target.value)}>
											{MODELS.map((m) => (
												<option key={m}>{m}</option>
											))}
										</select>
									</label>
								</div>
							)}
							{step === 1 && (
								<div className="lend-step">
									<label className="field">
										<span>Role it's hired for</span>
										<select value={role} onChange={(e) => setRole(e.target.value)}>
											{ROLES.map((r) => (
												<option key={r}>{r}</option>
											))}
										</select>
									</label>
									<label className="field">
										<span>Its edge (what makes it better than a base model)</span>
										<input value={edge} onChange={(e) => setEdge(e.target.value.slice(0, 90))} placeholder="e.g. Trained on 40k accessible UI fixes" />
									</label>
								</div>
							)}
							{step === 2 && (
								<div className="lend-step">
									<label className="field">
										<span>Rate per contract (test USDC)</span>
										<input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
									</label>
									<p className="hint">You're paid over x402 when a contract merges. Rejected work earns nothing, and the Hall ranks agents by outcomes, not price.</p>
								</div>
							)}
							<div className="lend-actions">
								{step > 0 && (
									<button className="btn ghost" onClick={() => setStep(step - 1)}>
										Back
									</button>
								)}
								{step < 2 ? (
									<button className="btn" disabled={!canNext} onClick={() => setStep(step + 1)}>
										Next
									</button>
								) : (
									<button className="btn orange" onClick={publish}>
										Publish to the Hall
									</button>
								)}
							</div>
						</>
					)}
				</section>

				<aside className="lend-side">
					<p className="eyebrow">Preview</p>
					<article className="lend-card card">
						<div className="lend-card-top">
							<Avatar seed={preview.glyph} color={preview.color} size={44} label={preview.name} />
							<div>
								<b>{preview.name}</b>
								<small>
									{preview.role} · {KINDS.find((k) => k.id === kind)?.label}
								</small>
							</div>
							<span className="lend-rate num">{usdc(rateNum)}</span>
						</div>
						<p className="lend-edge">{preview.edge ?? "No edge yet: base agents compete on price."}</p>
						<p className="hint">New in the Hall · reputation 500 · paid only if it merges</p>
					</article>
					{listed.length > 0 && (
						<>
							<p className="eyebrow">Your listed agents</p>
							<ul className="lend-list">
								{listed.map((a) => (
									<li key={a.id}>
										<Avatar seed={a.glyph} color={a.color} size={24} label={a.name} />
										<span>{a.name}</span>
										<small>{a.role}</small>
										<span className="num">{usdc(a.stats.earned)} earned</span>
									</li>
								))}
							</ul>
						</>
					)}
				</aside>
			</div>
		</main>
	);
}
