import type { Contract } from "../../types";

export function StatusChip({ status }: { status: Contract["status"] }) {
	const map: Record<string, [string, string]> = {
		offered: ["Open", "open"],
		forking: ["Open", "open"],
		working: ["Open", "open"],
		delivered: ["In review", "open"],
		reviewing: ["In review", "open"],
		queued: ["Waiting to merge", "open"],
		merging: ["Merging", "open"],
		conflict: ["Conflict", "warn"],
		resolving: ["Resolving", "warn"],
		merged: ["Merged", "ok"],
		paid: ["Merged and paid", "ok"],
		rejected: ["Rejected", "bad"],
	};
	const [label, tone] = map[status] ?? [status, ""];
	return (
		<span className={`chip st ${tone}`}>
			<span className="dot" />
			{label}
		</span>
	);
}

export function Pips({ score }: { score: number }) {
	return (
		<span className="pips inline" role="img" aria-label={`Inspection ${score} out of 5`}>
			{[1, 2, 3, 4, 5].map((n) => (
				<i key={n} className={n <= score ? "on" : ""} />
			))}
		</span>
	);
}

export function HumanMark({ size = 26 }: { size?: number }) {
	return (
		<span className="human" style={{ width: size, height: size }} role="img" aria-label="Ballast team (human)">
			<svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
				<rect width="32" height="32" rx="7" fill="#0F1826" />
				<rect x="7" y="19" width="14" height="5" rx="1.5" fill="#F6821F" />
				<rect x="11" y="12.5" width="14" height="5" rx="1.5" fill="#F7F8F9" />
				<rect x="7" y="6" width="14" height="5" rx="1.5" fill="#F6821F" />
			</svg>
		</span>
	);
}
