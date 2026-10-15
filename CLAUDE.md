# Forkyard (repo slug gadgethub): CLAUDE.md

Cloudflare "Build the next GitHub" contest entry (due 2026-10-14 11:59 PM PDT). Product message and architecture:
`README.md`. Real run numbers (the only numbers the site/film may use): `docs/RUNS.md`. Pinned replays: AI crew
`1aec47b1`, 100-agent scale run `8f25cfd0` (`ui/src/lib/config.ts` `PINS`).

## Stack
Worker `gadgethub` (Hono) + Durable Objects `Hall`/`Job`/`Desk` (SQLite) + Artifacts namespace `gadgethub` +
Workers AI `@cf/zai-org/glm-5.3-flash` + x402 v2 (`@x402/*` 2.28.0) + UI in `ui/` (Vite/React, builds to `public/`).
Video in `video/`.

## Commands
- Deploy: `(cd ui && npm run build) && npx wrangler deploy` → https://gadgethub.chris-d6a.workers.dev
- Tests: `npm test`; typecheck: `npx tsc --noEmit`; live e2e: `node scripts/e2e.mjs`
- Demo key: `DEMO_KEY` secret; local copy in `.dev.vars` (gitignored). The buyer wallet key lives only in `.dev.vars`.

## Gotchas (cost real time)
- `Omit<JobEvent, ...>` does not distribute over the union. Use `JobEventBody` from `src/shared/types.ts`.
- Artifacts: no local simulator; `repo.remote`/`defaultBranch` are NOT properties, use `await repo.info()`.
  `fork()` lives on a repo handle (`(await ARTIFACTS.get(src)).fork(name)`), is async; poll `info()` until ready.
- Git auth to Artifacts: Basic `x:<token secret>`, where secret = token before `?expires=`.
- Job phases run in `alarm()`; the phase key is cleared before running so alarm retries never re-run a phase.
- Foreman planning is ~30 s on GLM-5.3 Flash (gpt-oss-120b ~24 s, kimi-k2.7-code ~50 s; measured 2026-10-13).
- Agent code is untrusted: previews are served with `CSP: sandbox`. Never serve agent output on the app origin
  without it.
- Never expose unauthenticated routes that spend (AI or repo creation); the first spike did, and a security
  review caught it.
- Workers AI latency swings hard: GLM-5.3 Flash answered specialist edits in ~15-30 s overnight but ~110 s on
  2026-10-13 mid-morning PT, and one Foreman call hung >6 min. Every model call now has a 75 s timeout with a
  fallback to `@cf/openai/gpt-oss-120b` (src/agents/llm.ts). For recording the demo, have the pinned
  replays ready as the fallback.
- UI and server both validate job ids (`^[a-z0-9]{8}$`): an unvalidated `?job=` let a crafted link steer keyed
  POSTs to other endpoints (client-side path traversal; caught by security review).
- Artifacts `fork()` in a burst of 5 returned "An internal error occurred" for some forks (twice, 2026-10-13, on the
  previous seed). Hiring now staggers forks 350 ms apart, retries with backoff, and reuses a fork that exists after an
  error; a hire that still fails rejects only that contract.
- Sandboxed previews have an opaque origin, so ES module scripts (CORS-checked) don't load: seed/agent site JS must be
  classic `<script defer>` files (stated in seed BACKLOG.md).
- The seed hero lays out from `hero.clientWidth`, which can read ~0 on the first frame (iframes, emulation): guard
  layout math against tiny widths and wait for a real size before building the physics world.
- Don't deploy while a live job runs: a deploy restarts Durable Objects and kills the in-flight alarm phase.
- Agent worktrees (`.claude/worktrees/`) symlink `node_modules`; `git add -A ui` inside one committed the
  `ui/node_modules` symlink, which then replaced the real folder in the main checkout on merge. Never add
  `node_modules` paths; `.gitignore` now has a bare `node_modules` rule, and vitest excludes `.claude/**`.
- The scale run's conflicts all happen when crew lines merge into main (every 10th agent touches the shared ROLL
  line), so its conflict counter stays at 0 until the last ~25 s of the replay.
