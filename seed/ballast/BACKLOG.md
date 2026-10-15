# Ballast Type Co. backlog

The repo's issue tracker. 40 tasks, 8 per role. Each is one small find/replace edit (about 40 lines or fewer)
at a named slot. Slots are comments in the file, for example `<!-- slot:waterfall -->` or `/* slot:components-css */`.
The CSS for every component already exists: use the class names below and the result lands styled.

Rules for every task
- Ballast is a fictional type foundry. Keep the voice plain and specific. No real people, brands, awards or invented metrics.
- Site JS must be classic `<script src="..." defer>` files: no `import`/`export`, no `type="module"`, no `fetch` to the page's own origin, no external scripts or images. Google Fonts (Archivo, Newsreader) is already loaded.
- Do not remove or rename existing slot comments; put new content next to them (keep the comment in your replacement).
- Every text file stays at or under 16 KB; the whole site stays at or under 120 KB.
- CSS: one declaration per line, 2-space indent. Reuse the tokens in `styles/tokens.css` (`--hull`, `--chalk`, `--buoy`, `--minium`, `--tide`).
- Tasks marked (log) also add one line under `<!-- slot:changelog -->` in `CHANGELOG.md`.
- Tasks that name the same file as another task overlap on purpose: rebase on the latest main before you edit.
- `src/mosaic.js` belongs to the mosaic run. Never edit it by hand.

Faces: `f-display` (Ballast Display), `f-keel` (Ballast Keel, condensed), `f-text` (Ballast Text, serif), `f-ledger` (Ballast Ledger, monospace).

## Front-end
- [ ] FE-1 `index.html` at `<!-- slot:specimen-cards -->`: add a fourth card `<article class="specimen f-ledger">` with `<p class="specimen__glyph" aria-hidden="true">01</p>`, `<h3 class="specimen__name">Ballast Ledger</h3>`, `<p class="specimen__text">A sturdy monospace for tables, receipts and code.</p>` and `<p class="specimen__meta">Tabular figures, slashed zero</p>`. (log)
- [ ] FE-2 `index.html` at `<!-- slot:waterfall -->` inside `.waterfall`: add five rows of the form `<div class="wf" style="--s:96"><span class="wf__size">96 px</span><p class="wf__text">Heavy letters hold the page down</p></div>` at sizes 96, 64, 40, 24 and 16. (log)
- [ ] FE-3 `index.html` at `<!-- slot:pairing -->` inside `.pairing`: add `<div class="pairing__controls">` with two `<label>` + `<select>` pairs (ids `pair-head` and `pair-body`, options display, keel, text, ledger with the family names as labels) and `<div class="pairing__sample"><h3 class="pairing__head">The harbour opens at six</h3><p class="pairing__body">...</p></div>`; the body is two plain sentences about reading type at length.
- [ ] FE-4 `src/main.js` at `// slot:main-init` and `styles/components.css` at `/* slot:components-css */`: on `change` of `#pair-head` and `#pair-body`, set `data-head` and `data-body` on `.pairing`; add rules such as `.pairing[data-head="keel"] .pairing__head { font-stretch: 62%; }` and `[data-body="ledger"]` using the monospace stack, so the sample changes face live.
- [ ] FE-5 `index.html` at `<!-- slot:licensing-rows -->`: add a fourth row, `<tr><th scope="row">Broadcast</th>` with `data-label` cells: Covers "Titles and graphics in film, TV and streaming", Limit "One production", Per family "$480". Keep the existing cell pattern. (log)
- [ ] FE-6 `index.html` at `<!-- slot:journal-entries -->`: add two `<li class="entry">` items in the same shape as the existing three (`time.entry__date`, `div.entry__main` with `h3 > a` and one `p`, `span.entry__read`): one on kerning pairs in heavy weights, one on how the Keel condensed face was drawn. Dates earlier than 3 Sep 2026. (log)
- [ ] FE-7 `index.html` at `<!-- slot:glyph-cells -->`: add eight `<li>` cells for `£`, `€`, `¥`, `¢`, `/`, `(`, `)` and `*`, using `&amp;`-style entities only where HTML needs them.
- [ ] FE-8 `index.html` at `<!-- slot:newsletter -->` inside `.signup`: add `<form action="/api/subscribe" method="post"><input type="email" name="email" placeholder="you@studio.example" aria-label="Email address" required><button type="submit">Join the list</button></form>`. (log)

## Motion
- [ ] MO-1 `src/motion.js` at `// slot:motion-reveal` and `styles/motion.css` at `/* slot:motion-reveal-css */`: at init, mark every `.specimen`, `.entry` and `.licensing tbody tr` with `data-reveal`; an IntersectionObserver adds `.is-in` once. Hide `[data-reveal]` (opacity 0, translateY 20px) only under `.js` and only when `.is-armed` is on `<html>`; set `.is-armed` from the script so the page stays visible without it. Transition 600ms `var(--ease)`.
- [ ] MO-2 `src/motion.js` at `// slot:motion-nav` and `styles/motion.css` at `/* slot:motion-nav-css */`: add `.is-stuck` to `.nav` once `scrollY > 80` (passive scroll listener, rAF throttled); style it `position: fixed`, `background: rgba(14, 26, 40, 0.88)`, `backdrop-filter: blur(10px)`, with a 1.5px `--buoy` bottom border.
- [ ] MO-3 `styles/motion.css` at `/* slot:motion-hover-css */`: `.specimen:hover` and `:focus-within` lift by 8px (`translateY(-8px)`), the lower shadow grows to `0 15px 0` in the same colour family, transition 240ms `var(--ease)`.
- [ ] MO-4 `src/motion.js` at `// slot:motion-cursor` and `styles/motion.css` at `/* slot:motion-cursor-css */`: create a 14px rounded `--buoy` square only when `(pointer: fine)`; it eases toward the pointer with requestAnimationFrame, grows to 40px over `a` and `button`, has `pointer-events: none` and `z-index: 50`, and hides while the pointer is over `#stage`.
- [ ] MO-5 `src/motion.js` at `// slot:motion-helpers` and `styles/motion.css`: when `#mosaic` first scrolls into view, give each `.mosaic__cell` an index `--i` and add `.is-in` to `#mosaic-grid`; cells pop in with `@keyframes cell-in` (scale 0.6 to 1, 380ms) and `animation-delay: calc(var(--i) * 9ms)`.
- [ ] MO-6 `src/motion.js` at `// slot:motion-helpers` and `styles/motion.css`: on `pointermove` over `.glyphs`, set `--lift` (0 to 1, falling off over 140px from the pointer) on each `li`; style `.glyphs li { translate: 0 calc(var(--lift, 0) * -10px); }`. Skip on `(pointer: coarse)`.
- [ ] MO-7 `src/motion.js` at `// slot:motion-helpers` and `styles/motion.css`: while the hero scrolls out, write `--p` (0 to 1) on `.hero` (rAF throttled); `.hero__stage` gets `translate: 0 calc(var(--p, 0) * -48px)` and `opacity: calc(1 - var(--p, 0) * 0.6)`.
- [ ] MO-8 `styles/motion.css` at `/* slot:motion-reduced-css */` and `src/motion.js`: inside the reduced-motion block set `[data-reveal]` to its final state with no transition, remove the cell pop-in and lift effects, and confirm `init()` still returns early on `Ballast.reduced`.

## Back-end
- [ ] BE-1 `api/worker.ts` at `// slot:worker-data`: add `const FAMILIES` with four objects `{ slug, name, blurb }` for display, keel, text and ledger, using the card copy from `index.html`.
- [ ] BE-2 `api/worker.ts` at `// slot:worker-routes`: handle `GET /api/health` and return `{ ok: true, name: "ballast-type-site" }`. (log)
- [ ] BE-3 `api/worker.ts` at `// slot:worker-routes`: handle `GET /api/families` and return `FAMILIES` with `cache-control: public, max-age=300`. (log)
- [ ] BE-4 `api/worker.ts` at `// slot:worker-routes`: handle `GET /api/families/:slug`; return the family or `json({ error: "not_found" }, 404)`.
- [ ] BE-5 `api/worker.ts`, the `subscribe()` stub above `// slot:worker-handlers`: parse JSON or form data, trim and lowercase the email, return `400 { error: "invalid_email" }` unless it matches `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`, else `{ ok: true }`. (log)
- [ ] BE-6 `api/worker.ts`, the `json()` helper: add `access-control-allow-origin: *` and methods GET, POST, OPTIONS to every JSON response, and answer `OPTIONS /api/*` with 204 at `// slot:worker-routes`.
- [ ] BE-7 `api/worker.ts` at `// slot:worker-handlers`: add `methodNotAllowed(allow: string)` returning 405 JSON with an `allow` header, and use it for wrong methods on `/api/health`, `/api/families` and `/api/subscribe`.
- [ ] BE-8 `api/worker.ts` at `// slot:worker-routes`: handle `GET /api/mosaic`; fetch `/src/mosaic.js` through `env.ASSETS`, count lines matching `^T\[\d+\] = \{`, and return `{ filled, total: 100 }`.

## QA
- [ ] QA-1 `tests/site.test.js` at `// slot:tests-html`: assert `<html lang="en">`, exactly one `<h1>`, a viewport meta tag, a non-empty `<title>` and a meta description.
- [ ] QA-2 `tests/site.test.js` at `// slot:tests-html`: parse every local `src=` and `href=` in `index.html` and assert the file exists (`existsSync`).
- [ ] QA-3 `tests/site.test.js` at `// slot:tests-js`: read every `src/*.js` and assert no `import ` or `export ` statement, no `fetch(`, no `XMLHttpRequest` and no `type="module"` in `index.html`.
- [ ] QA-4 `tests/site.test.js` at `// slot:tests-css`: assert every text file is at most 16 KB and the whole site (skip `node_modules`, `.git`, `tests`) is at most 120 KB.
- [ ] QA-5 `tests/site.test.js` at `// slot:tests-js`: load `src/core.js` and `src/layout.js` with `node:vm` and a fake `window` (`matchMedia` returns `{ matches: false }`); call `Ballast.layout(1440, 70, 800)` and assert 7 specs, every tile inside 0..1440 and above y=800.
- [ ] QA-6 `tests/site.test.js` at `// slot:tests-js`: with the same vm setup, call `Ballast.layout` at widths 280, 390 and 1920 and assert no `NaN`, a positive tile height and that tile width is always less than the stage width.
- [ ] QA-7 `tests/site.test.js` at `// slot:tests-js`: evaluate `src/mosaic.js` in `node:vm` and assert every filled slot has `g` (1 or 2 characters), `h` between 0 and 360 and a non-empty `by`, and that `ROLL` is an array of strings.
- [ ] QA-8 `tests/site.test.js` at `// slot:tests-html` and `index.html` at `<!-- slot:skip-link -->`: add `<a class="sr" href="#top">Skip to content</a>` (visible on focus via `styles/base.css`), and assert every `aria-labelledby` points at an existing id.

## Platform
- [ ] PL-1 `_headers` at `# slot:headers`: add `/*` rules for `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. (log)
- [ ] PL-2 `_headers` at `# slot:headers`: add a Content-Security-Policy for `/*`: `default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:`.
- [ ] PL-3 `_headers` at `# slot:headers`: add `Cache-Control: public, max-age=300, must-revalidate` for `/styles/*` and `/src/*`, and `Cache-Control: no-cache` for `/` and `/index.html`.
- [ ] PL-4 `index.html` at `<!-- slot:head-extra -->`: add `theme-color` (`#0e1a28`), Open Graph and Twitter title and description meta tags reusing the existing description text.
- [ ] PL-5 `.github/workflows/ci.yml` at `# slot:ci-setup` and `# slot:ci-test`: add `actions/setup-node@v4` (node 22, npm cache), an `npm install` step and a step that runs `npm test`.
- [ ] PL-6 new `scripts/budget.mjs` plus `.github/workflows/ci.yml` at `# slot:ci-checks`: the script fails if any text file is over 16 KB or the site is over 120 KB (skip `node_modules`, `.git`); add a step running `node scripts/budget.mjs`.
- [ ] PL-7 `package.json` at `"//": "slot:scripts"` and `wrangler.jsonc` at `// slot:wrangler-bindings`: add scripts `budget`, `dev:worker` (`wrangler dev`) and `deploy` (`wrangler deploy`); add `"observability": { "enabled": true }` and a `SUBSCRIBERS` KV binding placeholder. (log)
- [ ] PL-8 `.github/workflows/ci.yml` at `# slot:ci-deploy`: add a `deploy` job that needs `check`, runs only on pushes to main, and uses `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets; add a Deploy section to `README.md`.
