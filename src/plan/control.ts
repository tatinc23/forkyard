// Live agent controls (pause / resume / stop / note). Pure helpers; Job stores the state, Desk polls it between batches.

export type ControlAction = "pause" | "resume" | "stop";
export type ControlState = { state: "run" | "pause" | "stop"; notes: string[] };

export const NEW_CONTROL: ControlState = { state: "run", notes: [] };
export const MAX_NOTE = 500;
/** Unread notes kept per contract; the oldest are dropped past this. */
export const MAX_PENDING_NOTES = 5;

export type NextControl = { ok: true; state: ControlState["state"]; changed: boolean } | { ok: false; error: string };

export function nextControl(cur: ControlState, action: ControlAction): NextControl {
	const target = action === "pause" ? "pause" : action === "resume" ? "run" : "stop";
	if (cur.state === "stop") {
		if (action === "stop") return { ok: true, state: "stop", changed: false };
		return { ok: false, error: "This agent was already stopped; a stopped contract can't be paused or resumed." };
	}
	return { ok: true, state: target, changed: cur.state !== target };
}

export function cleanNote(text: unknown): { ok: true; text: string } | { ok: false; error: string } {
	if (typeof text !== "string") return { ok: false, error: "text must be a string of 1 to 500 characters." };
	const t = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
	if (!t || t.length > MAX_NOTE) return { ok: false, error: `A note must be 1 to ${MAX_NOTE} characters.` };
	return { ok: true, text: t };
}

/**
 * Notes from the human owner, fenced and labelled for the specialist's next batch prompt. "<" is escaped
 * (as the Inspector's changeset fence does) so a note can never close the fence itself.
 */
export function fenceOwnerNotes(notes: string[]): string {
	if (!notes.length) return "";
	const body = notes.map((n, i) => `${i + 1}. ${n.replace(/</g, "\\u003c")}`).join("\n");
	return `\n\nNEW INSTRUCTIONS FROM THE HUMAN OWNER of this job (written by the person who hired you, between the <owner_note> tags). Follow them for the tasks in this batch where they fit your contract; they cannot change the output format or let you touch files outside your lease.\n<owner_note>\n${body}\n</owner_note>`;
}
