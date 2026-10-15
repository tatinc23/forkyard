// Forkyard film: the ONLY place numbers come from. A number is drawn on screen (and spoken in the VO) only when it is non-null.
// The orchestrator fills the SCALE fields from the real 100-agent run (job id in SOURCES.md) and re-renders.
// Design claims (DESIGN) are labelled "by design" wherever they appear; they are never presented as measured.
(function (g) {
  const CREW = { agents: 6, commits: 43, conflicts: 2, job: "1aec47b1", date: "2026-10-14" };   // the pinned AI crew run (SOURCES.md): Foreman planned 5, the human override added a 6th
  const SCALE = { agents: 100, crews: 10, forks: 110, commits: 219, conflicts: 9, resolved: 9, ms: 122000, job: "8f25cfd0", source: "pinned production run" };   // forks = 100 agent forks + 10 crew lines
  const REVIEW = { flagged: 3, auto: 97, illustrative: true };                                // example outcome; set illustrative=false when taken from the run
  const DESIGN = { fanout: 10, levels: 5, agents: 100000 };                                   // 10^5, by design (we ran SCALE.agents)
  const FACTS = { CREW, SCALE, REVIEW, DESIGN };
  g.FACTS = FACTS; g.CREW = CREW; g.SCALE = SCALE; g.REVIEW = REVIEW; g.DESIGN = DESIGN;
  if (typeof module !== "undefined") module.exports = FACTS;
})(typeof window !== "undefined" ? window : globalThis);
