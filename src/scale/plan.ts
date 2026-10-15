// Pure planning logic for the Forkyard scale run: crew grouping, the mosaic file format, each scripted agent's
// deterministic edit, and the re-delivery rules used when a merge conflicts. No I/O, so it is unit-tested directly.
import type { Agent } from "../shared/types";

/** The one file scripted agents edit. Merges operate on it; every other file in the repo is left alone. */
export const MOSAIC_PATH = "src/mosaic.js";
export const MAX_SCALE_AGENTS = 100;
export const MIN_SCALE_AGENTS = 10;

const pad3 = (n: number) => String(n).padStart(3, "0");
export const agentName = (n: number) => `yard-${pad3(n)}`;
export const crewName = (i: number) => `crew-${String(i).padStart(2, "0")}`; // i is 1-based
/** Every 10th agent also writes to the shared ROLL line: the planned, real conflict. */
export const isRollAgent = (n: number) => n % 10 === 0;

/** Validate the POST /api/scale body: agents 10-100 (default 100), crews 1..agents (default agents/10). */
export function scaleParams(body: { agents?: unknown; crews?: unknown }): { agents: number; crews: number } {
	const a = Number(body.agents);
	const agents = Number.isFinite(a) && body.agents !== undefined && body.agents !== null ? Math.floor(Math.min(MAX_SCALE_AGENTS, Math.max(MIN_SCALE_AGENTS, a))) : MAX_SCALE_AGENTS;
	const c = Number(body.crews);
	const wanted = Number.isFinite(c) && body.crews !== undefined && body.crews !== null ? Math.floor(c) : Math.max(1, Math.round(agents / 10));
	return { agents, crews: Math.min(agents, Math.max(1, wanted)) };
}

/** Contiguous crews of near-equal size; agents are numbered from 1. */
export function groupCrews(agents: number, crews: number): number[][] {
	const base = Math.floor(agents / crews);
	const extra = agents % crews;
	const out: number[][] = [];
	let next = 1;
	for (let i = 0; i < crews; i++) {
		const size = base + (i < extra ? 1 : 0);
		out.push(Array.from({ length: size }, () => next++));
	}
	return out;
}

/** Hiring/working order: round r holds the r-th member of every crew, so all crews advance together. */
export function roundsOf(groups: number[][]): number[][] {
	const rounds = Math.max(...groups.map((g) => g.length));
	return Array.from({ length: rounds }, (_, r) => groups.map((g) => g[r]).filter((n): n is number => n !== undefined));
}

// 100 distinct glyphs that look good in a type specimen. No quotes, backslashes or newlines (they go inside a JS string).
const GLYPHS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abdefghkmnqrty&@#$%?!*+=~^<>/|§¶†‡±÷×«»¿¡©®™£¥€ßæøåñçéüöÞþðÆØ∞≈≠∑∂√∫").slice(0, 100);
export const glyphFor = (n: number) => GLYPHS[(n * 37) % GLYPHS.length]; // 37 is coprime with 100: 100 agents get 100 glyphs
export const hueFor = (n: number) => (n * 137) % 360; // golden-angle-ish spread, distinct for 1..360

function hslToHex(h: number, s: number, l: number): string {
	const S = s / 100;
	const L = l / 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = S * Math.min(L, 1 - L);
	const f = (n: number) => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
	return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Roster entry for a scripted agent, saved with the replay so the UI can draw it like any other agent. */
export function scriptedAgent(n: number): Agent {
	const name = agentName(n);
	return {
		id: name,
		name: `Yard ${pad3(n)}`,
		handle: `@${name}`,
		specialty: "Scripted slot edit (no model)",
		tags: ["scale-run", "scripted"],
		model: "scripted",
		rate: 0,
		wallet: "0x0000000000000000000000000000000000000000",
		reputation: 500,
		stats: { contracts: 0, merged: 0, conflicts: 0, avgReview: 0, earned: 0 },
		glyph: n,
		color: hslToHex(hueFor(n), 62, 52),
		provider: "house",
		tier: "standard",
		role: "scripted",
	};
}

/** The mosaic file in the agreed format: `slots` empty slots, numbered from 1. */
export function buildMosaic(slots: number): string {
	let out = "var T = window.MOSAIC = [];\nvar ROLL = [];\n";
	for (let n = 1; n <= slots; n++) out += `\n// slot ${pad3(n)}\nT[${n}] = null;\n`;
	return out;
}

const ROLL_RE = /^var ROLL = (\[.*\]);$/m;
export function parseRoll(text: string): string[] {
	const m = text.match(ROLL_RE);
	if (!m) throw new Error("mosaic has no ROLL line");
	return JSON.parse(m[1]) as string[];
}
function setRoll(text: string, names: string[]): string {
	const line = `var ROLL = ${JSON.stringify(names)};`;
	return text.replace(ROLL_RE, () => line);
}

/**
 * Agent n's whole job: replace its own slot line (and, for every 10th agent, add its name to ROLL).
 * Deterministic and idempotent, so the same function is both the first delivery and the re-delivery after a conflict.
 */
export function applyAgentEdit(text: string, n: number): string {
	const slot = new RegExp(`^T\\[${n}\\] = .*;$`, "m");
	if (!slot.test(text)) throw new Error(`slot ${n} not found in ${MOSAIC_PATH}`);
	const line = `T[${n}] = { g: "${glyphFor(n)}", h: ${hueFor(n)}, by: "${agentName(n)}" };`;
	let out = text.replace(slot, () => line);
	if (isRollAgent(n)) {
		const roll = parseRoll(out);
		if (!roll.includes(agentName(n))) out = setRoll(out, [...roll, agentName(n)]);
	}
	return out;
}

/**
 * A crew line conflicted with main on the ROLL line. The crew's roll-call agent re-delivers on top of main: take the
 * clean-merged text (main's ROLL kept) and append the names the crew line carried that main does not have yet.
 */
export function redeliverCrew(mergedKeepingOurs: string, ours: string, theirs: string): string {
	const have = parseRoll(mergedKeepingOurs);
	const mine = parseRoll(theirs).filter((name) => !parseRoll(ours).includes(name) && !have.includes(name));
	return setRoll(mergedKeepingOurs, [...have, ...mine]);
}
