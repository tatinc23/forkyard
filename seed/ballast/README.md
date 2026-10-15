# Ballast Type Co.

A fictional type foundry and the demo repository for Forkyard. The hero is the wordmark as heavy type tiles you can
grab, throw and stack. Below it sit pre-styled sections (specimens, waterfall, glyph grid, pairing tester,
licensing, journal) and `#mosaic`, a 10 x 10 grid of glyphs fed by `src/mosaic.js`.

## Layout
- `index.html`: page shell. Slots are HTML comments such as `<!-- slot:waterfall -->`.
- `styles/`: tokens, base, hero, sections, components, mosaic, motion. Open slots (`.waterfall`, `.pairing`) show an
  outlined proof area until content is placed inside them.
- `src/`: classic scripts that share `window.Ballast` (not ES modules, so they load inside sandboxed previews).
  `src/mosaic.js` is data: 100 slots in a fixed format, one contributor per slot.
- `api/worker.ts`: Cloudflare Worker (`/api/*`), static assets served for everything else.
- `tests/`: vitest. `BACKLOG.md`: the task list.

## Run
`npx serve .` for the site, `npm test` for tests, `npx wrangler dev` for the Worker.

## Rules
Classic `<script defer>` files only. No external scripts or images; Google Fonts only. Every text file stays under
16 KB and the whole site under 120 KB. See `BACKLOG.md` for the task rules.
