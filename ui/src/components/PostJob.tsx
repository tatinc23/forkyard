import { useState } from "react";
import { Modal } from "./Overlay";
import "../styles/lend.css";
import { getDemoKey, setDemoKey } from "../lib/config";

/** Packaged outcome crews: a goal + budget the Foreman turns into an editable crew. For people who have never used git. */
const OUTCOMES: { label: string; goal: string; budget: string }[] = [
	{ label: "Website launch", goal: "Get the site ready to launch: fill every open slot, polish the specimen cards, add the newsletter signup with a working endpoint, and make it fast and accessible.", budget: "3.50" },
	{ label: "App feature", goal: "Build a type tester app on the site: pick a typeface, type your own text, change size and weight live, and share a link to the result.", budget: "3.00" },
	{ label: "Game", goal: "Add a playable mini-game to the hero: stack the letter tiles into the word BALLAST before the timer ends, with a score and a restart button.", budget: "3.00" },
	{ label: "Translation", goal: "Translate the whole site into Spanish and add a language switch that remembers the visitor's choice.", budget: "2.00" },
	{ label: "Docs", goal: "Turn README.md, CHANGELOG.md and BACKLOG.md into a clean docs page on the site with a table of contents and search.", budget: "1.50" },
	{ label: "Marketing campaign", goal: "Create a launch campaign: a launch banner on the site, the announcement email as an HTML page, and three social share cards.", budget: "2.50" },
];

/** "Post a job": the entry to plan -> Floor. Posting a real job needs the demo key; without one, the recorded run is the way in. */
export function PostJob({ open, onClose, source, busy, error, needsKey, onStart, onWatch, watching }: { open: boolean; onClose: () => void; source: string; busy: boolean; error: string; needsKey: boolean; onStart: (goal: string, budget: number) => void; onWatch: () => void; watching: boolean }) {
	const [goal, setGoal] = useState("");
	const [budget, setBudget] = useState("3.50");
	const [key, setKey] = useState(getDemoKey());
	const budgetNum = Number(budget);
	const locked = source === "live" && key.trim().length === 0;
	const valid = goal.trim().length >= 8 && Number.isFinite(budgetNum) && budgetNum > 0 && !locked;

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!valid || busy) return;
		if (key) setDemoKey(key.trim());
		onStart(goal.trim(), budgetNum);
	};

	return (
		<Modal open={open} onClose={onClose} label="Post a job" size="md">
			<form className="postjob" onSubmit={submit}>
				<h2>Post a job to ballast/type-site</h2>
				<p className="ov-lede">Say what should change and what you will pay. Foreman splits it into contracts and shows the plan and wages before anything is spent.</p>
				<div className="pj-outcomes" role="group" aria-label="Outcome crews">
					<span className="pj-outcomes-label">No GitHub needed: pick an outcome and Foreman hires the crew. You can edit everything before you pay.</span>
					<div className="pj-outcome-row">
						{OUTCOMES.map((o) => (
							<button key={o.label} type="button" className="chip-btn" aria-pressed={goal === o.goal} onClick={() => (setGoal(o.goal), setBudget(o.budget))}>
								{o.label}
							</button>
						))}
					</div>
				</div>
				<label className="field">
					<span>What should the crew build?</span>
					<textarea data-autofocus placeholder="e.g. Fill the waterfall slot, add a dark mode toggle, and write tests for the newsletter endpoint." value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={400} required />
				</label>
				<div className="post-row">
					<label className="field">
						<span>Budget (USDC, test network)</span>
						<input className="num" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} pattern="[0-9]*[.]?[0-9]*" />
					</label>
					<button className="btn orange big" type="submit" disabled={!valid || busy}>
						{busy ? "Posting" : locked ? "Needs a demo key" : "Post the job"}
					</button>
				</div>
				{(source === "live" || needsKey) && (
					<details className="keybox" open={needsKey || locked}>
						<summary>Demo key</summary>
						<label className="field">
							<span>Sent as the x-demo-key header</span>
							<input value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
						</label>
					</details>
				)}
				{locked && <p className="hint">Posting a real job needs a demo key. No key? Watch a recorded run instead; it plays the same flow.</p>}
				{error && (
					<p className="form-error" role="alert">
						{error}
					</p>
				)}
				<div className="pj-alt">
					<button type="button" className="btn ghost" onClick={onWatch} disabled={watching}>
						{watching ? "Loading the recording" : "Watch a real run instead"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
