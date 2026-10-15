// Workers AI wrapper that insists on JSON back.
export const DEFAULT_MODEL = "@cf/zai-org/glm-5.3-flash";
/** Used when the primary model times out or keeps failing (measured ~24 s for a Foreman plan). */
export const FALLBACK_MODEL = "@cf/openai/gpt-oss-120b";
const CALL_TIMEOUT_MS = 75_000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(what + " timed out after " + ms / 1000 + "s")), ms);
		p.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			},
		);
	});
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

function extractJson(text: string): unknown {
	const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
		throw new Error(`model did not return JSON: ${trimmed.slice(0, 200)}`);
	}
}

/** Ask a model for JSON; one corrective retry if parsing or validation fails. */
export async function askJson<T>(
	ai: Ai,
	opts: { model?: string; system: string; user: string; maxTokens?: number; validate?: (v: unknown) => T },
): Promise<T> {
	const model = opts.model ?? DEFAULT_MODEL;
	const messages: Msg[] = [
		{ role: "system", content: opts.system + "\n\nReply with ONLY one JSON object. No prose, no code fences." },
		{ role: "user", content: opts.user },
	];
	let lastErr: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		// Attempts: primary, primary with a correction, then the fallback model.
		const useModel = attempt < 2 ? model : FALLBACK_MODEL;
		let out: { choices?: { message?: { content?: string } }[]; response?: string };
		try {
			out = (await withTimeout(
				ai.run(useModel as keyof AiModels, { messages, max_tokens: opts.maxTokens ?? 4000, reasoning: { effort: "low" } } as never),
				CALL_TIMEOUT_MS,
				useModel,
			)) as typeof out;
		} catch (e) {
			lastErr = e;
			console.warn("model call failed", useModel, String(e));
			if (attempt === 0) attempt = 1; // a timeout skips the correction round and goes straight to the fallback
			continue;
		}
		const text = out.choices?.[0]?.message?.content ?? out.response ?? "";
		try {
			const parsed = extractJson(text);
			return opts.validate ? opts.validate(parsed) : (parsed as T);
		} catch (e) {
			lastErr = e;
			messages.push({ role: "assistant", content: text.slice(0, 4000) });
			messages.push({ role: "user", content: `That was not valid: ${String(e).slice(0, 300)}. Reply again with ONLY the corrected JSON object.` });
		}
	}
	throw lastErr;
}
