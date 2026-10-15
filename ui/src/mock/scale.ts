import type { Agent, Contract, Conflict, JobEvent, RecordedRun } from "../types";

// A deterministic stand-in for the real 100-agent scale run (spec A2): same events, same shapes, scripted pacing.
// Used for `?scale=1` and as the labelled fallback when no scale replay is pinned (PINS.scale in lib/config.ts).
// 100 agents in 10 crews; each agent forks, commits one slot of src/mosaic.js and merges into its crew line; every 10th
// agent also appends to the shared ROLL line, which collides (about 10 conflicts, each resolved by the agent that caused it);
// the crew lines then fold into main.

type Strip<T> = T extends unknown ? Omit<T, "t" | "jobId"> : never;
type Draft = { sec: number; ev: Strip<JobEvent> };

const CREW_NAMES = ["Serif", "Sans", "Slab", "Mono", "Script", "Display", "Blackletter", "Grotesque", "Didone", "Humanist"];
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ&@%§¶";

function rng(seed: number) {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hslHex(h: number, s: number, l: number): string {
	const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(255 * c).toString(16).padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

const pad = (n: number) => String(n).padStart(3, "0");

export function buildScaleRun(nAgents = 100, nCrews = 10): RecordedRun {
	const r = rng(42);
	const jobId = "scale_mock";
	const T0 = Date.now();
	const per = Math.ceil(nAgents / nCrews);
	let shaN = 0;
	const sha = () => {
		shaN++;
		return (((shaN * 2654435761) >>> 0).toString(16).padStart(8, "0") + "c41d7e90a3b2").slice(0, 12);
	};
	const out: Draft[] = [];
	const add = (sec: number, ev: Draft["ev"]) => out.push({ sec, ev });

	const agents: Agent[] = [];
	const contracts: Contract[] = [];
	const crewOf: number[] = [];
	for (let i = 1; i <= nAgents; i++) {
		const crew = Math.floor((i - 1) / per);
		crewOf[i] = crew;
		const id = `yard-${pad(i)}`;
		agents.push({
			id,
			name: `Yard ${pad(i)}`,
			handle: `@${id}`,
			specialty: "Scripted slot filler",
			tags: ["scripted"],
			model: "scripted",
			rate: 0,
			wallet: "0x0000000000000000000000000000000000000000",
			reputation: 500,
			stats: { contracts: 0, merged: 0, conflicts: 0, avgReview: 0, earned: 0 },
			glyph: i * 7 + 3,
			color: hslHex((crew * 36 + 12) % 360, 78, 58),
			provider: "hall",
			tier: "standard",
			role: "Slot filler",
		});
		contracts.push({
			id: `s${pad(i)}`,
			agentId: id,
			title: `Fill slot ${pad(i)}`,
			brief: `Write slot ${pad(i)} of the mosaic in src/mosaic.js.`,
			paths: ["src/mosaic.js"],
			wage: 0,
			status: "offered",
			attempts: 0,
			role: "Slot filler",
			crewId: `crew-${crew + 1}`,
			tasks: [{ id: `s${pad(i)}-t1`, title: `Fill slot ${pad(i)}`, paths: ["src/mosaic.js"], status: "todo" }],
		});
	}
	const crewIds = Array.from({ length: nCrews }, (_, c) => `crew-${c + 1}`);
	const members = crewIds.map((_, c) => contracts.filter((_, i) => crewOf[i + 1] === c).map((x) => x.id));

	// Planning (no human gate: scale runs start themselves).
	add(0, { type: "status", status: "planning" });
	["Reading the repo: src/mosaic.js has 100 empty slots", `One agent per slot, ${nCrews} crews of ${per}`, "Each agent gets its own fork and a lease on its slot", "Every tenth agent also appends to the shared ROLL line: expect collisions"].forEach((note, i) => add(0.4 + i * 0.5, { type: "foreman", note }));
	add(2.6, { type: "plan", plan: { summary: `${nAgents} scripted agents, ${nCrews} crews. Agents merge into their crew line in parallel; crew lines then merge into main.`, overlaps: [{ path: "src/mosaic.js", contracts: contracts.map((c) => c.id) }] }, contracts, budget: 0 });
	crewIds.forEach((crewId, c) => add(2.7, { type: "crew", crewId, name: CREW_NAMES[c] ?? `Crew ${c + 1}`, contractIds: members[c] }));
	add(3.0, { type: "status", status: "hiring" });

	// Hire + fork, staggered.
	const forkedAt: number[] = [];
	for (let i = 1; i <= nAgents; i++) {
		const c = contracts[i - 1];
		const hired = 3.2 + (i - 1) * 0.085;
		const forked = hired + 0.28 + r() * 0.25;
		forkedAt[i] = forked;
		add(hired, { type: "hired", contractId: c.id, agentId: c.agentId, wage: 0 });
		add(forked, { type: "forked", contractId: c.id, fork: { name: `forkyard-${jobId}-${c.agentId}`, remote: `https://artifacts.example/forkyard/${jobId}-${c.agentId}.git` }, ms: Math.round(380 + r() * 520), tokenExpiresAt: new Date(T0 + 12 * 60_000 + forked * 1000).toISOString() });
	}
	add(4.2, { type: "status", status: "working" });

	// Work + deliver.
	const deliverAt: number[] = [];
	for (let i = 1; i <= nAgents; i++) {
		const c = contracts[i - 1];
		const t0 = forkedAt[i] + 0.3;
		const hue = Math.round(r() * 359);
		const glyph = GLYPHS[Math.floor(r() * GLYPHS.length)];
		const roll = i % 10 === 0;
		add(t0, { type: "thinking", contractId: c.id, note: `Reading src/mosaic.js, finding slot ${pad(i)}` });
		add(t0 + 0.9 + r() * 1.5, { type: "typing", contractId: c.id, path: "src/mosaic.js", chunk: `// slot ${pad(i)}\nT[${i}] = { g: "${glyph}", h: ${hue}, by: "${c.agentId}" };\n${roll ? `ROLL.push("${c.agentId}");\n` : ""}` });
		const taskAt = t0 + 2.6 + r() * 3;
		add(taskAt, { type: "task", contractId: c.id, taskId: `${c.id}-t1`, title: `Fill slot ${pad(i)}`, sha: sha().slice(0, 7), story: `Slot ${pad(i)} now shows "${glyph}" in hue ${hue}.` });
		const d = taskAt + 0.5 + r() * 12;
		deliverAt[i] = d;
		add(d, { type: "delivered", contractId: c.id, sha: sha(), changes: { files: [{ path: "src/mosaic.js", kind: "modified", added: roll ? 2 : 1, removed: 1 }], added: roll ? 2 : 1, removed: 1 } });
	}

	// Merge: crews run in parallel with each other; inside a crew the merges are serial.
	let firstMerge = Infinity;
	const crewDone: number[] = [];
	const crewConflicts: number[] = [];
	crewIds.forEach((crewId, c) => {
		const order = members[c].map((id) => ({ id, i: contracts.findIndex((x) => x.id === id) + 1 })).sort((a, b) => deliverAt[a.i] - deliverAt[b.i]);
		let cursor = 0;
		let prev: string | undefined;
		let conflicts = 0;
		for (const m of order) {
			const start = Math.max(deliverAt[m.i] + 0.25, cursor);
			firstMerge = Math.min(firstMerge, start);
			add(start, { type: "merge_start", contractId: m.id });
			const hit = m.i % 10 === 0 && !!prev;
			if (hit) {
				conflicts++;
				const conflict: Conflict = { path: "src/mosaic.js", baseLine: 2, base: ["var ROLL = [];"], ours: [`var ROLL = ["${contracts.find((x) => x.id === prev)!.agentId}"];`], theirs: [`var ROLL = ["${contracts[m.i - 1].agentId}"];`] };
				add(start + 0.6, { type: "conflict", contractId: m.id, withContractId: prev, conflicts: [conflict] });
				add(start + 2.2, { type: "resolving", contractId: m.id });
				add(start + 2.4, { type: "typing", contractId: m.id, path: "src/mosaic.js", chunk: `var ROLL = ["${contracts.find((x) => x.id === prev)!.agentId}", "${contracts[m.i - 1].agentId}"];\n` });
				cursor = start + 3.7;
			} else cursor = start + 0.6;
			add(cursor, { type: "merged", contractId: m.id, sha: sha(), outcomes: [{ path: "src/mosaic.js", status: hit ? "merged" : "theirs" }], into: crewId });
			prev = m.id;
		}
		crewDone[c] = cursor + 0.5;
		crewConflicts[c] = conflicts;
	});
	add(firstMerge - 0.1, { type: "status", status: "merging" });

	// Crew lines fold into main, one at a time (the only serial step left).
	let mainCursor = 0;
	let last = 0;
	[...crewIds.keys()].sort((a, b) => crewDone[a] - crewDone[b]).forEach((c) => {
		const at = Math.max(crewDone[c], mainCursor + 1.1);
		mainCursor = at;
		last = at;
		add(at, { type: "crew_merged", crewId: crewIds[c], sha: sha(), conflicts: crewConflicts[c] });
	});
	const conflictTotal = crewConflicts.reduce((a, b) => a + b, 0);
	add(last + 0.9, { type: "scale_done", agents: nAgents, forks: nAgents + nCrews, commits: nAgents + conflictTotal, conflicts: conflictTotal, resolved: conflictTotal, ms: Math.round((last + 0.9) * 1000) });
	add(last + 1.1, { type: "status", status: "closed" });

	const events: JobEvent[] = out
		.map((d, i) => ({ d, i }))
		.sort((a, b) => a.d.sec - b.d.sec || a.i - b.i)
		.map(({ d }) => ({ ...d.ev, t: Math.round(T0 + d.sec * 1000), jobId }) as JobEvent);

	return {
		job: { id: jobId, goal: `Fill the Ballast mosaic: ${nAgents} agents, one slot each`, budget: 0, status: "closed", contracts, mainline: [{ sha: "9d3e0b1c4a77", message: "Initial commit: Ballast Type Co.", at: T0 }], createdAt: T0, totalCost: 0, mode: "scale" },
		events,
		agents,
	};
}
