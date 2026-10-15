import type { Chapter } from "@shared/types";

/** Review by exception: the Inspector already checked every delivery, so a human only needs the consequential ones. */
export type Group = "needs" | "auto" | "rejected";

/** Files where a mistake is costly (server code, deploy and security config, dependencies, CI). */
const RISKY = /(^|\/)(api|functions|workers?)\/|worker|wrangler|(^|\/)_headers$|(^|\/)package(-lock)?\.json$|(^|\/)\.github\/|(^|\/)\.env/i;

export const isRiskyPath = (p: string) => RISKY.test(p);

export function chapterPaths(c: Chapter): string[] {
	const set = new Set<string>();
	c.changes?.files.forEach((f) => set.add(f.path));
	c.diff?.forEach((f) => set.add(f.path));
	return [...set];
}

export type Triage = { group: Group; reasons: string[]; risky: string[] };

export function triageOf(c: Chapter): Triage {
	const risky = chapterPaths(c).filter(isRiskyPath);
	if (c.status === "rejected") return { group: "rejected", reasons: [c.inspection ? `Inspector ${c.inspection.score}/5, sent back` : "Inspector sent it back"], risky };
	const reasons: string[] = [];
	const score = c.inspection?.score;
	if (score == null) reasons.push("Not inspected");
	else if (score < 4) reasons.push(`Inspector ${score}/5`);
	if (c.conflict) reasons.push(c.conflict.resolved ? "Had a merge conflict" : "Unresolved conflict");
	if (risky.length) reasons.push(risky.length === 1 ? `Touches ${risky[0]}` : `Touches ${risky[0]} and ${risky.length - 1} more risky ${risky.length === 2 ? "file" : "files"}`);
	if (reasons.length) return { group: "needs", reasons, risky };
	return { group: "auto", reasons: [`Inspector ${score}/5, only low-risk files`], risky };
}

export const GROUP_LABEL: Record<Group, string> = { needs: "Needs you", auto: "Auto-approvable", rejected: "Rejected by Inspector" };
