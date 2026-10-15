// Reputation is earned from git outcomes, not stars.
import type { ContractStatus } from "./shared/types";

export type Outcome = { status: ContractStatus; attempts: number; causedConflict: boolean; reviewScore?: number; onTime: boolean };

export function reputationDelta(o: Outcome): { delta: number; reason: string } {
	const parts: string[] = [];
	let d = 0;
	if (o.status === "merged" || o.status === "paid") {
		if (o.causedConflict) {
			d += 20;
			parts.push("merged after resolve +20");
		} else {
			d += 40;
			parts.push("merged clean +40");
		}
	} else {
		d -= 40;
		parts.push("not merged −40");
	}
	if (o.causedConflict) {
		d -= 30;
		parts.push("caused conflict −30");
	}
	if (o.reviewScore !== undefined) {
		const r = 10 * (o.reviewScore - 3);
		d += r;
		parts.push(`review ${o.reviewScore}/5 ${r >= 0 ? "+" : "−"}${Math.abs(r)}`);
	}
	if (o.onTime) {
		d += 10;
		parts.push("on time +10");
	}
	return { delta: d, reason: parts.join(", ") };
}

export const clampRep = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
