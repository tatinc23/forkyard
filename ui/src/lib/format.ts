export const usdc = (n: number) => n.toFixed(2);
export const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);
export const sha7 = (s?: string) => (s ? s.slice(0, 7) : "");
export function clock(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export function ago(ts: number, now = Date.now()): string {
	const s = Math.max(0, Math.round((now - ts) / 1000));
	if (s < 60) return "just now";
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	const d = Math.round(h / 24);
	return d < 30 ? `${d} d ago` : `${Math.round(d / 30)} mo ago`;
}
export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
