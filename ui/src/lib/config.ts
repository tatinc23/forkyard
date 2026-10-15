const q = new URLSearchParams(typeof location === "undefined" ? "" : location.search);

export const FLAGS = {
	mock: q.has("mock") && q.get("mock") !== "0",
	replay: q.has("replay") && q.get("replay") !== "0",
	scale: q.has("scale") && q.get("scale") !== "0", // dev entry: play the mock 100-agent scale run straight away
	job: /^[a-z0-9]{8}$/.test(q.get("job") ?? "") ? q.get("job")! : "", // job ids are 8 lowercase alnum; anything else is ignored
};

/** Pinned job ids for the two recorded runs the landing page plays. The orchestrator fills `scale` once the 100-agent run exists. */
export const PINS = { crew: "1aec47b1", scale: "8f25cfd0" };

const KEY_NAME = "forkyardKey";

let memoryKey = "";

// A key in the address bar is saved once, then removed from the URL so it never stays in history or screenshots.
(function captureKeyFromUrl() {
	if (typeof location === "undefined") return;
	const fromUrl = q.get("key");
	if (!fromUrl) return;
	memoryKey = fromUrl;
	try {
		localStorage.setItem(KEY_NAME, fromUrl);
	} catch {
		/* storage can be blocked; the in-memory copy still works for this tab */
	}
	q.delete("key");
	const qs = q.toString();
	try {
		history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
	} catch {
		/* ignore */
	}
})();

export function getDemoKey(): string {
	if (memoryKey) return memoryKey;
	try {
		return localStorage.getItem(KEY_NAME) ?? "";
	} catch {
		return "";
	}
}

export function setDemoKey(key: string) {
	memoryKey = key;
	try {
		localStorage.setItem(KEY_NAME, key);
	} catch {
		/* ignore */
	}
}
