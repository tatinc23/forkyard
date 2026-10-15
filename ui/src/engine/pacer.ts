import type { UIEvent } from "./state";

/** Minimum time (ms) a visual beat holds before the next one may start. Live events can arrive in a burst; the floor must stay readable. */
const HOLD: Partial<Record<UIEvent["type"], number>> = {
	hired: 320,
	forked: 380,
	task: 220,
	delivered: 650,
	review: 900,
	queued: 700,
	merge_start: 1000,
	conflict: 2200,
	resolving: 700,
	_snap: 950,
	merged: 1200,
	reverted: 1200,
	rejected: 1300,
	payout: 1000,
	reputation: 650,
	review_ready: 900,
	status: 260,
	plan: 400,
};

/** Chatter that a "step to the next event" press skips over, so one press always lands on something visible. */
const MINOR = new Set<UIEvent["type"]>(["typing", "thinking", "foreman", "task"]);

/**
 * Queues events and releases them at a readable pace. `speed` scales the holds (0.5 = slow motion, 2 = fast).
 * `pause()` freezes the visual queue (events keep buffering); `step()` releases up to the next visible beat.
 */
export class Pacer {
	private q: UIEvent[] = [];
	private timer: ReturnType<typeof setTimeout> | undefined;
	private nextAt = 0;
	private resolving = new Set<string>();
	private dead = false;
	private paused = false;
	private speed = 1;
	/** Scale runs fire dozens of beats a second; their holds shrink so the swarm stays ahead of the clock. */
	holdScale = 1;

	constructor(private emit: (e: UIEvent) => void) {}

	get pending() {
		return this.q.length;
	}
	get isPaused() {
		return this.paused;
	}

	push(ev: UIEvent) {
		this.q.push(ev);
		this.pump();
	}

	setSpeed(s: number) {
		this.speed = s;
	}

	pause() {
		this.paused = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
	}

	resume() {
		if (!this.paused) return;
		this.paused = false;
		this.pump();
	}

	/** Release events up to and including the next visible one, ignoring holds. Stays paused. */
	step() {
		this.pause();
		for (let guard = 0; guard < 400; guard++) {
			const ev = this.take();
			if (!ev) return;
			this.emit(ev.ev);
			if (!MINOR.has(ev.ev.type)) return;
		}
	}

	/** Next event to emit, inserting the "snap" beat before a resolved conflict merges. */
	private take(): { ev: UIEvent; hold: number } | undefined {
		const ev = this.q.shift();
		if (!ev) return undefined;
		if (ev.type === "resolving") this.resolving.add(ev.contractId);
		if (ev.type === "merged" && this.resolving.has(ev.contractId)) {
			this.resolving.delete(ev.contractId);
			this.q.unshift(ev);
			return { ev: { type: "_snap", contractId: ev.contractId, t: ev.t, jobId: ev.jobId }, hold: HOLD._snap ?? 0 };
		}
		let hold = HOLD[ev.type] ?? 0;
		hold *= this.holdScale;
		if (this.q.length > 30 && this.speed >= 1) hold *= 0.3; // catch up after a burst, but never in slow motion
		return { ev, hold };
	}

	private pump() {
		if (this.dead || this.paused || this.timer) return;
		const now = performance.now();
		if (now < this.nextAt) {
			this.timer = setTimeout(() => {
				this.timer = undefined;
				this.pump();
			}, this.nextAt - now);
			return;
		}
		const t = this.take();
		if (!t) return;
		this.emit(t.ev);
		this.nextAt = performance.now() + t.hold / this.speed;
		this.pump();
	}

	clear() {
		this.dead = true;
		if (this.timer) clearTimeout(this.timer);
		this.q = [];
	}
}
