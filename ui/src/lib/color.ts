function lum(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a: string, b: string): number {
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}
function mix(a: string, b: string, t: number): string {
	const pa = parseInt(a.slice(1), 16);
	const pb = parseInt(b.slice(1), 16);
	const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
	return "#" + [16, 8, 0].map((s) => c(s).toString(16).padStart(2, "0")).join("");
}
const INK = "#0F1826";
const PAPER = "#FFFFFF";
const cache = new Map<string, { fill: string; text: string }>();

/** A brick fill + a text colour that reaches 4.5:1 against it. */
export function brick(hex: string): { fill: string; text: string } {
	const hit = cache.get(hex);
	if (hit) return hit;
	const text = contrast(hex, INK) >= contrast(hex, PAPER) ? INK : PAPER;
	let fill = hex;
	for (let i = 0; i < 12 && contrast(fill, text) < 4.5; i++) fill = mix(fill, text === INK ? PAPER : INK, 0.08);
	const out = { fill, text };
	cache.set(hex, out);
	return out;
}

/** A darker variant of an accent so it can be used as text on the light page. */
export function textOnPaper(hex: string, bg = "#F7F8F9"): string {
	let c = hex;
	for (let i = 0; i < 14 && contrast(c, bg) < 4.5; i++) c = mix(c, INK, 0.1);
	return c;
}
