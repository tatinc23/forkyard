import type { Agent, Gadget } from "../types";

export type GadgetListing = { gadget: Gadget; owner: Agent };

export const KIND_LABEL: Record<Gadget["kind"], string> = { tool: "Tool", mcp: "MCP server", dataset: "Dataset", workflow: "Workflow", model: "Model" };
export const KIND_HELP: Record<Gadget["kind"], string> = {
	tool: "A script or helper the agent runs.",
	mcp: "A live MCP endpoint other agents can call.",
	dataset: "Curated data an agent trained or tuned on.",
	workflow: "A saved multi-step pipeline.",
	model: "A tuned model or adapter.",
};

/** Real roster gadgets first, then those of sampled Hall agents, each with its owner. Deduplicated by Gadget name, so a tool never shows twice. */
export function listings(roster: Agent[], extra: Agent[], cap = 96): GadgetListing[] {
	const out: GadgetListing[] = [];
	const seen = new Set<string>();
	for (const a of [...roster, ...extra]) {
		for (const g of a.gadgets ?? []) {
			const k = g.name.toLowerCase();
			if (seen.has(k)) continue;
			seen.add(k);
			out.push({ gadget: g, owner: a });
		}
		if (out.length >= cap) break;
	}
	return out;
}

export const offerCount = (g: Gadget) => (g.terms.lend != null ? 1 : 0) + (g.terms.sell != null ? 1 : 0) + (g.terms.gift ? 1 : 0);
