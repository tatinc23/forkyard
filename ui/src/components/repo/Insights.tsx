import type { JobView } from "../../types";
import { usdc } from "../../lib/format";

const WEEKS = [3, 5, 4, 8, 6, 11, 9, 14, 12, 17, 15, 21];

/** Mostly mocked: the shape of what a maintainer would watch. Totals come from the real jobs where there are any. */
export function Insights({ jobs }: { jobs: JobView[] }) {
	const cs = jobs.flatMap((j) => j.contracts);
	const paid = cs.filter((c) => c.status === "paid" || c.status === "merged").length;
	const spend = jobs.reduce((s, j) => s + j.totalCost, 0);
	const budget = jobs.reduce((s, j) => s + j.budget, 0);
	const reviews = cs.flatMap((c) => (c.review ? [c.review.score] : []));
	const avg = reviews.length ? reviews.reduce((a, b) => a + b, 0) / reviews.length : 0;
	const max = Math.max(...WEEKS);
	const pts = WEEKS.map((v, i) => `${(i / (WEEKS.length - 1)) * 300},${70 - (v / max) * 62}`).join(" ");
	const dist = [1, 2, 3, 4, 5].map((n) => reviews.filter((r) => r === n).length);
	const dmax = Math.max(1, ...dist);
	return (
		<section aria-label="Insights">
			<div className="tiles">
				<div className="rrcard pad tile">
					<span className="hint">Contracts merged</span>
					<strong className="num big">{paid}</strong>
					<span className="hint">of {cs.length} posted</span>
				</div>
				<div className="rrcard pad tile">
					<span className="hint">Spend vs budget</span>
					<strong className="num big">{usdc(spend)}</strong>
					<span className="hint">of {usdc(budget)} USDC budgeted</span>
				</div>
				<div className="rrcard pad tile">
					<span className="hint">Average inspection</span>
					<strong className="num big">{avg ? avg.toFixed(1) : "n/a"}</strong>
					<span className="hint">out of 5</span>
				</div>
				<div className="rrcard pad tile">
					<span className="hint">Median time to merge</span>
					<strong className="num big">6 min</strong>
					<span className="hint">mock figure</span>
				</div>
			</div>
			<div className="chart-grid">
				<figure className="rcard pad">
					<figcaption>
						<h2>Agent commits per week</h2>
						<span className="hint">Mock data</span>
					</figcaption>
					<svg viewBox="0 0 300 80" role="img" aria-label="Agent commits per week, rising over twelve weeks" className="spark-big">
						<polyline points={`0,78 ${pts} 300,78`} fill="var(--orange-soft)" stroke="none" />
						<polyline points={pts} fill="none" stroke="var(--orange)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
					</svg>
				</figure>
				<figure className="rcard pad">
					<figcaption>
						<h2>Inspection scores</h2>
						<span className="hint">{reviews.length} reviews</span>
					</figcaption>
					<div className="hbars" role="img" aria-label={`Score distribution: ${dist.map((d, i) => `${i + 1} stars ${d}`).join(", ")}`}>
						{dist.map((d, i) => (
							<div key={i}>
								<span className="num">{i + 1}</span>
								<i style={{ width: `${(d / dmax) * 100}%` }} />
								<span className="num hint">{d}</span>
							</div>
						))}
					</div>
				</figure>
			</div>
		</section>
	);
}
