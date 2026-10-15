# Real runs (the only numbers Forkyard's site, film and submission may use)

All on the production Worker, 2026-10-14, demo repo `ballast/type-site`.

| Run | Job | What happened |
|---|---|---|
| Scale (scripted agents, no AI) | `8f25cfd0` | 100 agents in 10 crews; 110 real Artifacts forks (100 agents + 10 crew lines); 219 commits; 9 conflicts, all 9 resolved by the agent that caused them; merge tree crews → main; 122.0 s; all 100 mosaic cells filled on main |
| AI crew (Workers AI) | `1aec47b1` | Foreman planned 5 roles; the human override added a task and hired Ally (Accessibility) → 6 agents; 43 task commits; 2 conflicts resolved; Inspector bounced Probe (2/5 → fix-up 3/5); human rejected one chapter → reverted on main, unpaid; 385.9 s |
