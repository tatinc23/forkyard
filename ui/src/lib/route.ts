import { useCallback, useEffect, useState } from "react";

export type Page = "repo" | "hall" | "lend" | "gadgets" | "docs";
export type RepoTab = "overview" | "code" | "contracts" | "history" | "crew" | "insights";
export type Route = { page: Page; tab: RepoTab };

const TABS: RepoTab[] = ["overview", "code", "contracts", "history", "crew", "insights"];

export function parse(hash: string): Route {
	const p = hash.replace(/^#\/?/, "").split("/")[0];
	if (p === "hall" || p === "lend" || p === "gadgets" || p === "docs") return { page: p, tab: "overview" };
	if ((TABS as string[]).includes(p)) return { page: "repo", tab: p as RepoTab };
	return { page: "repo", tab: "overview" };
}

export const hrefFor = (r: Route | Page | RepoTab) => {
	if (r === "hall" || r === "lend" || r === "gadgets" || r === "docs") return `#/${r}`;
	if (typeof r === "string") return r === "overview" ? "#/" : `#/${r}`;
	return r.page === "repo" ? (r.tab === "overview" ? "#/" : `#/${r.tab}`) : `#/${r.page}`;
};

/** Hash routing keeps the Worker's static asset serving trivial (no SPA fallback rules) and survives reloads. */
export function useRoute(): [Route, (to: Page | RepoTab) => void] {
	const [route, setRoute] = useState<Route>(() => parse(typeof location === "undefined" ? "" : location.hash));
	useEffect(() => {
		const on = () => setRoute(parse(location.hash));
		window.addEventListener("hashchange", on);
		return () => window.removeEventListener("hashchange", on);
	}, []);
	const go = useCallback((to: Page | RepoTab) => {
		const h = hrefFor(to);
		if (location.hash === h || (h === "#/" && (location.hash === "" || location.hash === "#"))) setRoute(parse(h));
		else location.hash = h;
		window.scrollTo({ top: 0 });
	}, []);
	return [route, go];
}
