import type { JobEvent } from "../types";

export type PlayerOpts = { maxGap?: number; speed?: number; onGate?: (kind: "budget" | "signoff") => void; onChange?: () => void };

const isGate = (e: JobEvent) => e.type === "status" && (e.status === "awaiting_budget" || e.status === "awaiting_signoff");
const MINOR = new Set(["typing", "thinking", "foreman", "task"]);

/**
 * Plays a recorded/mock event list with its original spacing. Pauses by itself at the two human gates until `resume()`,
 * and the viewer can pause, change speed (0.5x/1x/2x) or step to the next visible event at any time.
 */
export class Player {
	private i = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private gated = false;
	private user = false;
	private dead = false;
	private speed: number;

	constructor(
		private events: JobEvent[],
		private emit: (e: JobEvent) => void,
		private opts: PlayerOpts = {},
	) {
		this.speed = opts.speed ?? 1;
	}

	get state() {
		return { paused: this.user, gated: this.gated, speed: this.speed, done: this.i >= this.events.length, index: this.i, total: this.events.length };
	}

	start() {
		this.step();
	}

	private idle() {
		return this.dead || this.gated || this.user;
	}

	private step() {
		if (this.idle()) return;
		const ev = this.events[this.i];
		if (!ev) return;
		const prev = this.events[this.i - 1];
		const gap = prev ? Math.min(this.opts.maxGap ?? 5000, Math.max(0, ev.t - prev.t)) / this.speed : 0;
		this.timer = setTimeout(() => {
			if (this.idle()) return;
			this.fire();
			this.step();
		}, gap);
	}

	private fire() {
		const ev = this.events[this.i++];
		if (!ev) return;
		this.emit(ev);
		if (isGate(ev)) {
			this.gated = true;
			this.opts.onGate?.(ev.type === "status" && ev.status === "awaiting_budget" ? "budget" : "signoff");
		}
		this.opts.onChange?.();
	}

	pause() {
		this.user = true;
		if (this.timer) clearTimeout(this.timer);
		this.opts.onChange?.();
	}

	play() {
		if (!this.user) return;
		this.user = false;
		this.opts.onChange?.();
		this.step();
	}

	setSpeed(s: number) {
		this.speed = s;
		if (this.timer) clearTimeout(this.timer);
		this.step();
		this.opts.onChange?.();
	}

	/** While paused: emit everything up to and including the next visible event. Does not cross a human gate. */
	stepNext() {
		if (!this.user) this.pause();
		if (this.gated) return;
		for (let guard = 0; guard < 600 && this.i < this.events.length && !this.gated; guard++) {
			const ev = this.events[this.i];
			this.fire();
			if (!MINOR.has(ev.type)) break;
		}
	}

	/** The human approved the gate (budget or sign-off). */
	resume() {
		if (!this.gated) return;
		this.gated = false;
		this.user = false;
		this.opts.onChange?.();
		this.step();
	}

	stop() {
		this.dead = true;
		if (this.timer) clearTimeout(this.timer);
	}
}
