import type { Agent, Contract, HallView, JobEvent, RecordedRun } from "../types";
import { ROSTER } from "../types";
import * as C from "./code";

/** Stretches the authored timeline so the whole job runs about 70 s (the demo fallback). */
const SCALE = 1.55;
const MAIN0 = { sha: "9d3e0b1c4a77", message: "Initial commit: Corner Shop page" };

let n = 0;
const sha = () => {
	n++;
	const h = ((n * 2654435761) >>> 0).toString(16).padStart(8, "0");
	return (h + "a3c91e07d5b2").slice(0, 12);
};

type Strip<T> = T extends unknown ? Omit<T, "t" | "jobId"> : never;
type Draft = { sec: number; ev: Strip<JobEvent> };

export const mockHall = (): HallView => ({
	agents: [...ROSTER].sort((a, b) => b.reputation - a.reputation),
	jobs: [],
	ledger: [],
	paymentsMode: "simulate",
});

export const MOCK_GOAL = "Add dark mode, product search and a cart counter to my shop page, and write the README.";

export function buildMockRun(goal = MOCK_GOAL, budget = 3.5): RecordedRun {
	n = 0;
	const jobId = "job_demo";
	const T0 = Date.now();
	const out: Draft[] = [];
	let shift = 0; // phase B starts after the budget gate; keep the authored numbers and shift them once
	const add = (sec: number, ev: Draft["ev"]) => out.push({ sec: sec + shift, ev });
	const think = (c: string, sec: number, note: string) => add(sec, { type: "thinking", contractId: c, note });
	const typeFile = (c: string, path: string, text: string, from: number, to: number) => {
		const size = 26;
		const chunks: string[] = [];
		for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
		chunks.forEach((chunk, i) => add(from + ((to - from) * i) / Math.max(1, chunks.length - 1), { type: "typing", contractId: c, path, chunk }));
	};
	const agent = (id: string): Agent => ROSTER.find((a) => a.id === id)!;

	const TASKS: Record<string, string[]> = {
		c1: ["Define light and dark colour tokens", "Apply the tokens to header and cards", "Add the theme toggle", "Remember the choice and honour the system setting"],
		c2: ["Filter products as you type", "Add the search box to the header", "Show a no-results state", "Clear the box with Esc"],
		c3: ["Track items added to the cart", "Persist the cart across reloads", "Show the count in the header"],
		c4: ["Outline the README", "Write the run steps", "Add the file map"],
	};
	const ROLE: Record<string, string> = { c1: "Front-end", c2: "Data UX", c3: "Logic", c4: "Docs" };
	const task = (c: string, sec: number, n: number) => add(sec, { type: "task", contractId: c, taskId: `${c}-t${n}`, title: TASKS[c][n - 1], sha: sha().slice(0, 7) });
	const withTasks = (c: Contract): Contract => ({ ...c, role: ROLE[c.id], tasks: TASKS[c.id].map((title, i) => ({ id: `${c.id}-t${i + 1}`, title, paths: c.paths, status: "todo" as const })) });

	const base: Contract[] = [
		{ id: "c1", agentId: "vanta", title: "Dark mode toggle", brief: "Add light and dark colour tokens and a header toggle that switches the theme.", paths: ["index.html", "styles.css"], wage: agent("vanta").rate, status: "offered", attempts: 0 },
		{ id: "c2", agentId: "sift", title: "Product search", brief: "Filter the product cards as the shopper types, and show an empty state.", paths: ["index.html", "app.js"], wage: agent("sift").rate, status: "offered", attempts: 0 },
		{ id: "c3", agentId: "ledger", title: "Cart counter", brief: "Count the items added to the cart and show the total in the header.", paths: ["app.js", "index.html"], wage: agent("ledger").rate, status: "offered", attempts: 0 },
		{ id: "c4", agentId: "quill", title: "README", brief: "Document how to run the page and what each file does.", paths: ["README.md"], wage: agent("quill").rate, status: "offered", attempts: 0 },
	];
	const contracts = base.map(withTasks);

	// Phase A: planning, then the budget gate.
	add(0, { type: "status", status: "planning" });
	const notes = ["Reading the goal and the current index.html", "Found 4 separable tasks: theme, search, cart, docs", "Checking the Hall for who is free and what they charge", "Leasing files so agents do not edit the same lines", "Pricing wages from each agent's rate"];
	notes.forEach((note, i) => add(0.8 + i * 1.5, { type: "foreman", note }));
	add(8.6, {
		type: "plan",
		plan: {
			summary: "Four independent tasks on one page. Three of them touch index.html and two touch app.js, so merges will run one at a time and I expect to resolve one overlap.",
			overlaps: [
				{ path: "index.html", contracts: ["c1", "c2", "c3"] },
				{ path: "app.js", contracts: ["c2", "c3"] },
			],
		},
		contracts,
		budget,
	});
	add(9.2, { type: "status", status: "awaiting_budget" });
	shift = 6.4;

	// Phase B: hire, fork, work, review, merge.
	add(3.4, { type: "status", status: "hiring" });
	const hires: [string, string, number, number, number][] = [
		["c1", "vanta", 3.9, 4.5, 612],
		["c2", "sift", 4.5, 5.1, 744],
		["c3", "ledger", 5.1, 5.8, 587],
		["c4", "quill", 5.7, 6.3, 698],
	];
	for (const [c, a, hiredAt, forkedAt, ms] of hires) {
		add(hiredAt, { type: "hired", contractId: c, agentId: a, wage: agent(a).rate });
		add(forkedAt, {
			type: "forked",
			contractId: c,
			fork: { name: `forkyard-${jobId}-${a}`, remote: `https://artifacts.example/forkyard/${jobId}-${a}.git` },
			ms,
			tokenExpiresAt: new Date(T0 + 15 * 60_000 + forkedAt * SCALE * 1000).toISOString(),
		});
	}
	add(6.8, { type: "status", status: "working" });

	// Vanta
	think("c1", 7.0, "Reading styles.css and the page structure");
	think("c1", 7.2, "Defining colour tokens for light and dark");
	task("c1", 9.2, 1);
	typeFile("c1", "styles.css", C.VANTA_CSS, 7.5, 11.4);
	task("c1", 11.5, 2);
	think("c1", 11.6, "Adding the toggle to the header");
	typeFile("c1", "index.html", C.VANTA_HTML, 12.0, 14.4);
	task("c1", 13.2, 3);
	task("c1", 14.7, 4);
	const vSha = sha();
	add(15.0, { type: "delivered", contractId: "c1", sha: vSha, changes: { files: [{ path: "styles.css", kind: "modified", added: 21, removed: 0 }, { path: "index.html", kind: "modified", added: 13, removed: 1 }], added: 34, removed: 1 } });
	add(17.0, { type: "review", contractId: "c1", score: 4, notes: "Tokens are consistent and the toggle sets aria-pressed. Preference is not persisted yet." });

	// Quill
	think("c4", 7.2, "Reading the files the other agents are touching");
	think("c4", 8.4, "Drafting the README outline");
	typeFile("c4", "README.md", C.QUILL_MD, 8.8, 12.6);
	task("c4", 9.6, 1);
	task("c4", 11.4, 2);
	task("c4", 12.7, 3);
	const qSha = sha();
	add(13.0, { type: "delivered", contractId: "c4", sha: qSha, changes: { files: [{ path: "README.md", kind: "added", added: 18, removed: 0 }], added: 18, removed: 0 } });
	add(14.6, { type: "review", contractId: "c4", score: 4, notes: "Clear run steps and an accurate file map." });
	add(15.0, { type: "queued", contractId: "c4", position: 1 });
	add(15.1, { type: "status", status: "merging" });
	add(15.6, { type: "merge_start", contractId: "c4" });
	const qMerge = sha();
	add(18.2, { type: "merged", contractId: "c4", sha: qMerge, outcomes: [{ path: "README.md", status: "theirs" }] });
	add(17.5, { type: "queued", contractId: "c1", position: 2 });
	add(18.8, { type: "merge_start", contractId: "c1" });
	const vMerge = sha();
	add(20.6, { type: "merged", contractId: "c1", sha: vMerge, outcomes: [{ path: "styles.css", status: "theirs" }, { path: "index.html", status: "theirs" }] });

	// Sift, first attempt (rejected)
	think("c2", 7.0, "Scanning the product markup for searchable text");
	think("c2", 7.3, "Writing the filter function");
	typeFile("c2", "app.js", C.SIFT_JS_V1, 7.6, 12.6);
	task("c2", 10.4, 1);
	think("c2", 12.8, "Wiring the search input into the header");
	typeFile("c2", "index.html", C.SIFT_HTML, 13.2, 14.8);
	task("c2", 14.9, 2);
	add(15.6, { type: "delivered", contractId: "c2", sha: sha(), changes: { files: [{ path: "app.js", kind: "modified", added: 17, removed: 0 }, { path: "index.html", kind: "modified", added: 3, removed: 0 }], added: 20, removed: 0 } });
	add(17.8, { type: "review", contractId: "c2", score: 2, notes: "No empty state when nothing matches, and Esc does not clear the box. Not shippable." });
	add(18.6, { type: "rejected", contractId: "c2", reason: "Missing the no-results state and keyboard clear" });
	// Sift, second attempt
	think("c2", 19.4, "The reviewer wants an empty state and Esc to clear");
	typeFile("c2", "app.js", C.SIFT_JS_V2, 19.8, 23.4);
	task("c2", 22.6, 3);
	typeFile("c2", "index.html", C.SIFT_HTML_V2, 23.6, 24.6);
	task("c2", 24.7, 4);
	add(25.0, { type: "delivered", contractId: "c2", sha: sha(), changes: { files: [{ path: "app.js", kind: "modified", added: 21, removed: 0 }, { path: "index.html", kind: "modified", added: 5, removed: 0 }], added: 26, removed: 0 } });
	add(26.6, { type: "review", contractId: "c2", score: 4, notes: "Empty state and Esc handled. Filtering is case-insensitive." });

	// Ledger
	think("c3", 7.4, "Planning cart state in localStorage");
	think("c3", 7.8, "Writing the add-to-cart handler");
	typeFile("c3", "app.js", C.LEDGER_JS, 8.2, 15.0);
	task("c3", 10.4, 1);
	task("c3", 14.6, 2);
	think("c3", 15.2, "Placing the counter in the header");
	typeFile("c3", "index.html", C.LEDGER_HTML, 15.6, 16.8);
	task("c3", 16.9, 3);
	add(18.0, { type: "delivered", contractId: "c3", sha: sha(), changes: { files: [{ path: "app.js", kind: "modified", added: 19, removed: 0 }, { path: "index.html", kind: "modified", added: 3, removed: 0 }], added: 22, removed: 0 } });
	add(20.2, { type: "review", contractId: "c3", score: 4, notes: "Counter survives reloads. Quantity logic is correct." });
	add(21.0, { type: "queued", contractId: "c3", position: 1 });
	add(21.6, { type: "merge_start", contractId: "c3" });
	add(23.6, { type: "merged", contractId: "c3", sha: sha(), outcomes: [{ path: "app.js", status: "theirs" }, { path: "index.html", status: "merged" }] });

	// Sift hits the overlap
	add(27.2, { type: "queued", contractId: "c2", position: 1 });
	add(27.8, { type: "merge_start", contractId: "c2" });
	add(29.6, {
		type: "conflict",
		contractId: "c2",
		withContractId: "c3",
		conflicts: [
			{
				path: "index.html",
				baseLine: 14,
				base: ["<h1>Corner Shop</h1>"],
				ours: ["<h1>Corner Shop</h1>", '<a class="cart" href="#cart">Cart <span id="cart-count">0</span></a>'],
				theirs: ["<h1>Corner Shop</h1>", '<input id="search" type="search" placeholder="Search products">'],
			},
		],
	});
	add(31.6, { type: "resolving", contractId: "c2" });
	think("c2", 31.8, "Keeping both the search box and the cart link");
	typeFile("c2", "index.html", C.SIFT_RESOLVED, 32.4, 35.0);
	add(36.0, { type: "merged", contractId: "c2", sha: sha(), outcomes: [{ path: "app.js", status: "merged" }, { path: "index.html", status: "merged" }] });
	add(36.6, { type: "review_ready" });
	add(37.0, { type: "status", status: "awaiting_signoff" });

	// Phase C: sign-off, pay, reputation.
	add(37.6, { type: "status", status: "paying" });
	const pay: [string, string, number, number, number, string][] = [
		["c1", "vanta", 38.0, 38.5, 872, "Merged clean +40, review 4 +10, on time +10"],
		["c4", "quill", 39.5, 40.0, 700, "Merged clean +40, review 4 +10, on time +10"],
		["c3", "ledger", 41.0, 41.5, 761, "Merged clean +40, review 4 +10, on time +10"],
		["c2", "sift", 42.5, 43.0, 714, "Rejected once −40, caused a conflict −30, merged after resolve +20, review 4 +10, on time +10"],
	];
	for (const [c, a, paySec, repSec, after, reason] of pay) {
		const amount = agent(a).rate;
		add(paySec, { type: "payout", payout: { contractId: c, agentId: a, amount, mode: "simulate", network: "base-sepolia", at: T0 + paySec * SCALE * 1000 } });
		add(repSec, { type: "reputation", agentId: a, before: agent(a).reputation, after, reason });
	}
	add(44.4, { type: "status", status: "closed" });

	const events: JobEvent[] = out
		.map((d, i) => ({ d, i }))
		.sort((a, b) => a.d.sec - b.d.sec || a.i - b.i)
		.map(({ d }) => ({ ...d.ev, t: Math.round(T0 + d.sec * SCALE * 1000), jobId }) as JobEvent);

	const job = {
		id: jobId,
		goal,
		budget,
		status: "closed" as const,
		contracts,
		mainline: [{ ...MOCK_MAIN0(), at: T0 }],
		createdAt: T0,
		totalCost: contracts.reduce((s, c) => s + c.wage, 0),
	};
	return { job, events, agents: ROSTER };
}

export function MOCK_MAIN0() {
	return { sha: MAIN0.sha, message: MAIN0.message };
}
