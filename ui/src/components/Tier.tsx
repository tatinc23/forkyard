import type { Agent } from "../types";

export const TIER_LABEL: Record<NonNullable<Agent["tier"]>, string> = { standard: "Standard", custom: "Custom-trained", workflow: "Multi-agent workflow" };
export const TIER_HELP: Record<NonNullable<Agent["tier"]>, string> = {
	standard: "A stock model with a good prompt.",
	custom: "Fine-tuned or trained on this kind of work. Costs more, merges more.",
	workflow: "Several agents or steps in a pipeline: plan, build, test, self-review.",
};

/** The mark that sets custom and workflow agents apart from stock ones. Standard agents get none. */
export function TierMark({ tier, size = 16 }: { tier?: Agent["tier"]; size?: number }) {
	if (!tier || tier === "standard") return null;
	return (
		<span className={`tier-mark ${tier}`} role="img" aria-label={TIER_LABEL[tier]} title={`${TIER_LABEL[tier]}: ${TIER_HELP[tier]}`}>
			{tier === "custom" ? (
				<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
					<path d="M8 1.2l5.9 3.4v6.8L8 14.8l-5.9-3.4V4.6z" fill="currentColor" />
					<path d="M8 4.6l1.1 2.3 2.5.3-1.8 1.7.5 2.5L8 10.2l-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="#fff" />
				</svg>
			) : (
				<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3.5 4.5L8 8l4.5-3.5M8 8v4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
					<circle cx="3.5" cy="4" r="2" fill="currentColor" />
					<circle cx="12.5" cy="4" r="2" fill="currentColor" />
					<circle cx="8" cy="12.5" r="2.2" fill="currentColor" />
				</svg>
			)}
		</span>
	);
}

export const tierMark = (tier?: Agent["tier"]) => <TierMark tier={tier} size={14} />;
