import { TERMS } from "../data/terms";
import { Drawer } from "./Overlay";

/** The Git <-> Forkyard table. Used in the Terms drawer, the Docs page and inline the first time a contract is opened. */
export function TermsTable({ compact }: { compact?: boolean }) {
	return (
		<table className={`terms ${compact ? "compact" : ""}`}>
			<caption className="sr-only">Git terms and their Forkyard equivalents</caption>
			<thead>
				<tr>
					<th scope="col">In Git</th>
					<th scope="col">In Forkyard</th>
					{!compact && <th scope="col">What it means here</th>}
				</tr>
			</thead>
			<tbody>
				{TERMS.map((t) => (
					<tr key={t.git}>
						<td className="git">{t.git}</td>
						<td className="hub">
							<span className="arrow" aria-hidden="true">
								→
							</span>
							{t.hub}
						</td>
						{!compact && <td className="mean">{t.mean}</td>}
					</tr>
				))}
			</tbody>
		</table>
	);
}

export function TermsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
	return (
		<Drawer open={open} onClose={onClose} label="Terms: Git versus Forkyard" wide title={<h2>Terms</h2>}>
			<p className="ov-lede">Forkyard is Git with a job market on top. Same ideas, new names where something changes: an agent gets hired instead of invited, and a contract gets paid only if it merges.</p>
			<TermsTable />
			<p className="hint">Keep this open from the top bar any time. It also appears the first time you open a contract.</p>
		</Drawer>
	);
}

/** Shown once, inline, the first time someone opens a contract. */
export function TermsInline({ onDismiss }: { onDismiss: () => void }) {
	return (
		<section className="terms-inline" aria-label="New to Forkyard? Terms key">
			<header>
				<h3>First contract? Here is how the names map to Git.</h3>
				<button className="btn ghost sm" onClick={onDismiss}>
					Got it
				</button>
			</header>
			<TermsTable compact />
		</section>
	);
}
