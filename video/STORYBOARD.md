# Forkyard film storyboard (v3)

Three segments, each rendered alone (`out/seg_open.mp4`, `seg_hood.mp4`, `seg_close.mp4`, 1920x1080, 60 fps). Order in the full demo video:
open (about 96 s) -> product walkthrough (about 3 min, captured from the app, segment G) -> under the hood (about 43 s) -> close (about 16 s).
Scene arc per segment: Question -> Model -> Proof -> Turn -> Payoff. The theme ("a new way for hundreds of thousands of agents to work on changes at once") is on screen by 4.6 s.
Each beat teaches one thing; headline <= 8 words, sub <= 1 line; captions are the VO lines (`vo.json`).

## A. Opening (96 s) - `segs.open.pieces` in `timeline.js`
| Time | Piece | Teaches | Picture |
|---|---|---|---|
| 0-4 | hook (v2 S1) | GitHub was built for people taking turns | humans land clean commits one at a time on a shared main |
| 4-10 | hook | agents don't take turns; the theme | four agents slam into the same main, three rounds, hatched overlaps |
| 8-15 | fork (v2 S2) | a fork per agent | the shared repo splits into main + five forks |
| 15-24 | crew (v2 S5) | a crew works at once; every task is its own commit | five drawn lanes, 43 task commits (`CREW.commits`), stamp "6 agents" |
| 24-33 | queue (v2 S7) | a queue lands them one at a time; a conflict is data; the cause resolves it | conveyor to main, JSON conflict card, re-delivery |
| 33-40 | **scale A (new)** | scaling is one control | the user drags CREW SIZE from 5 to 100; ten crew boxes fill with agent glyphs (shape + role, 10 per crew) |
| 40-46 | **scale B** | every agent has its own fork; nobody waits | 100 glyphs commit at different moments; strip "100 agents / 110 forks / 10 crews / 219 commits" from `facts.js` |
| 46-61 | **scale C** | a merge tree, not a queue | left: one queue filling cell by cell; right: ten crews merge in parallel into crew lines then main; conflicts bounce back to the causing agent and re-deliver; "real run: merged in 122.0 s" from `facts.js` |
| 61-70.6 | **scale D** | five levels of ten = 100,000, by design | ladder 10 / 100 / 1,000 / 10,000 / 100,000; the 100 row is "we ran this", the rest dashed "by design" |
| 70.6-76 | **scale E** | can a human watch 100 agents? No. | the 100 glyphs in motion, a dashed "your attention" frame on one crew, a big "No." |
| 76-82.4 | **scale F** | review by exception | grid shrinks; most glyphs tick as approved, three are hatched and appear as "needs you" cards (`REVIEW`, "example numbers") |
| 82.4-90.9 | review (v2 S8) | a live before and after; approve or reject and it is reverted | Lens over the site, chapter rail, one rejection |
| 90.9-96 | pay (v2 S9) | paid only if it merges | Approve & pay, x402 coins to the merged hires only |

## B. Under the hood (43 s) - `hoodScene` in `film.js`
Five chips stay on screen; the active one inverts. Artifacts (3.9-19: mainline, fork per agent, write token with TTL draining, then readFile at a sha with a scrubber) -> Durable Objects (19.2-24.1: Job + Desk per agent) -> merge engine (24.3-30: change set JSON in, merged or structured conflict out) -> Workers AI (30.2-35.7: GLM-5.3 Flash, code typing) -> x402 (35.9-43: wallet to merged agents, "Base Sepolia testnet").

## D. Close (15.6 s) - `closeScene`
A 10x10 glyph mosaic assembles; "One repo. / A hundred agents. / All at once." lands line by line with the VO; "Forkyard · built on Cloudflare Workers + Artifacts" and "open source (MIT)". Nothing else (no org, repo URL or person).

## Visual identity
Matches the app: light paper, ink outlines (3 px), offset-shadow-free flat boxes, one orange accent family. Agents are identified by shape + name (or shape + crew position at 100), never colour alone; conflict / approved / flagged use glyphs and hatching. Orange text only as deep orange (#A84A06).
