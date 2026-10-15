# Sources (every number and claim in the Forkyard film)

Rule: a number is drawn on screen or spoken only if it comes from `facts.js`; `null` means "not drawn". Illustrative drawings carry no numerals.

| On screen / VO | Source |
|---|---|
| Theme line "a new way for hundreds of thousands of agents to work on changes at once" | the contest theme (2026-10-14 brief) and `docs/superpowers/specs/2026-10-14-forkyard-design.md` section 1 |
| Hero line "One repo. A hundred agents. All at once." and descriptor "Source control for agent crews." | spec section 2 (exact words) |
| The three ideas: a fork per agent; a merge tree, not a queue; review by exception; "paid only if it merges" | spec section 2 |
| `CREW`: "A live run: 6 agents, 43 commits", "task commits, 6 agents" | pinned AI-crew run, job `1aec47b1` (orchestrator, `docs/RUNS.md`, 2026-10-14): Foreman planned 5, the human override added a task and hired a 6th (Ally, Accessibility); 43 task commits; 2 conflicts resolved; the Inspector bounced Probe (2/5, fix-up 3/5); one chapter rejected and reverted on main. The drawn five lanes are the Foreman's planned crew and the per-lane split 9,8,9,8,9 is an illustrative split of the 43 (conflicts and the bounce are not shown as numbers). |
| `SCALE`: 100 agents, 10 crews, 110 forks (100 agent forks + 10 crew lines), 219 commits, 9 conflicts (all 9 resolved), 122.0 s, job `8f25cfd0` | pinned production scale run (orchestrator, `docs/RUNS.md`, 2026-10-14). The merge-tree animation runs at film pace (about 12 s); only the label "real run: merged in 122.0 s" is the real wall time. |
| `REVIEW` "3 flagged / 97 approved automatically" | **example numbers** (`illustrative: true`, labelled "example numbers" on screen) until taken from the run |
| `DESIGN`: "100,000 agents = 5 levels of 10" and the 10 / 100 / 1,000 / 10,000 / 100,000 ladder | arithmetic (10^5), labelled "by design" on every row beyond the 100 we ran. A design claim, never a measurement. |
| Queue pace in the "One queue" panel | **illustrative** ("illustrative pace" on screen); not a measurement of any merge queue |
| Artifacts: mainline + fork per agent, contract-scoped write token with TTL, `readFile` at a ref | repo `CLAUDE.md`, `src/do/job.ts` (`createToken("write", CONTRACT_TTL_S)`), `src/index.ts` (`repo.readFile({ ref, path })`); the short shas shown on the timeline (a1f3 ...) are **illustrative** |
| Durable Objects `Job` and `Desk` (one per agent) | `CLAUDE.md` Stack section |
| Merge engine: JSON change sets, structured conflict (`path`, `base`, `ours`, `theirs`) | README "Why an agent-native merge?"; field values are illustrative |
| Workers AI, `@cf/zai-org/glm-5.3-flash` ("plan, code, inspect") | `src/agents/llm.ts` (`DEFAULT_MODEL`), README stack table |
| x402 payouts, test USDC, Base Sepolia, "testnet" | README and spec; payouts are simulated unless the buyer wallet is funded, so the film says "testnet" and "simulated unless funded" |
| Crew roles, lane names, leased file names, the visual-review beat (Lens / Blend / X-ray, chapters, approve / reject, revert) | v2 design spec and `ui/src/review/`; the wireframe site is a drawing of the Ballast Type Co. demo repo, not a screenshot |
| "open source (MIT)" | repo `LICENSE` (MIT License) |
| Voice | Cloudflare Workers AI text-to-speech, `@cf/deepgram/aura-2-en`, speaker `orion` (see README) |
| Fonts | Newsreader and JetBrains Mono, SIL OFL, self-hosted in `fonts/` |
| Process principles | an explainer-motion-studio prompt (attribution kept in that template) |
