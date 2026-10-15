export type Tok = { t: string; c?: string };
type Lang = "html" | "css" | "js" | "md" | "txt";

export function langOf(path: string): Lang {
	if (path.endsWith(".html")) return "html";
	if (path.endsWith(".css")) return "css";
	if (path.endsWith(".js") || path.endsWith(".ts")) return "js";
	if (path.endsWith(".md")) return "md";
	return "txt";
}

const RULES: Record<Lang, [RegExp, string[]]> = {
	js: [/(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|\b(const|let|function|return|if|else|for|of|in|new|await|async|import|export|true|false|null)\b|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*)(?=\()/g, ["cm", "st", "kw", "nu", "fn"]],
	css: [/(\/\*.*?(?:\*\/|$))|("[^"]*"?|'[^']*'?)|(--?[a-zA-Z][\w-]*)(?=\s*:)|(#[0-9a-fA-F]{3,8}\b)|(\b\d+(?:\.\d+)?(?:px|rem|em|%|ms|s|vh|vw)?)|([.#][A-Za-z_][\w-]*)|(\[[^\]]*\]?)/g, ["cm", "st", "pr", "nu", "nu", "fn", "kw"]],
	html: [/(<!--.*?(?:-->|$))|(<\/?[a-zA-Z][\w-]*)|(\s[a-zA-Z-]+)(?==)|("[^"]*"?)|(\/?>)/g, ["cm", "kw", "pr", "st", "kw"]],
	md: [/^(#{1,3}\s.*)|(`[^`]*`?)|^(\s*[-*]\s)|(\*\*[^*]*\*?\*?)/g, ["kw", "st", "kw", "fn"]],
	txt: [/$^/g, []],
};

export function highlight(line: string, lang: Lang): Tok[] {
	const [re, classes] = RULES[lang];
	const out: Tok[] = [];
	let last = 0;
	re.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line))) {
		if (m[0] === "") {
			re.lastIndex++;
			continue;
		}
		if (m.index > last) out.push({ t: line.slice(last, m.index) });
		const gi = m.findIndex((g, i) => i > 0 && g !== undefined) - 1;
		out.push({ t: m[0], c: classes[gi] });
		last = m.index + m[0].length;
	}
	if (last < line.length) out.push({ t: line.slice(last) });
	return out;
}
