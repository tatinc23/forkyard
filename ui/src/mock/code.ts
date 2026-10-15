// Real-looking file contents the mock agents "type". Kept as arrays of lines so chunks read naturally.
export const VANTA_CSS = `:root {
  --bg: #fbfaf8;
  --ink: #17181c;
  --accent: #f6821f;
  color-scheme: light dark;
}

[data-theme="dark"] {
  --bg: #121317;
  --ink: #ecebe8;
  --accent: #ffa24d;
}

body {
  background: var(--bg);
  color: var(--ink);
  transition: background 200ms ease, color 200ms ease;
}

.theme-toggle {
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
}
`;

export const VANTA_HTML = `<header class="site-header">
  <h1>Corner Shop</h1>
  <button class="theme-toggle" aria-pressed="false">
    Dark mode
  </button>
</header>
<script>
  const root = document.documentElement;
  document.querySelector(".theme-toggle").onclick = (e) => {
    const dark = root.dataset.theme !== "dark";
    root.dataset.theme = dark ? "dark" : "light";
    e.currentTarget.setAttribute("aria-pressed", dark);
  };
</script>
`;

export const QUILL_MD = `# Corner Shop

A one-page shop with dark mode, instant search
and a cart counter.

## Run it

Open \`index.html\` in a browser. There is no
build step.

## What is inside

- \`styles.css\` holds the colour tokens and the
  dark theme.
- \`app.js\` filters products as you type and
  keeps the cart in localStorage.
- \`index.html\` wires the header controls.

## Keyboard

Press \`Esc\` in the search box to clear it.
`;

export const SIFT_JS_V1 = `const input = document.querySelector("#search");
const cards = [...document.querySelectorAll(".product")];

function filter(query) {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const card of cards) {
    const hit = card.textContent.toLowerCase().includes(q);
    card.hidden = !hit;
    if (hit) shown++;
  }
  return shown;
}

input.addEventListener("input", () => {
  filter(input.value);
});
`;

export const SIFT_HTML = `<input id="search" type="search"
       placeholder="Search products"
       aria-label="Search products">
`;

export const SIFT_JS_V2 = `const input = document.querySelector("#search");
const empty = document.querySelector("#no-results");
const cards = [...document.querySelectorAll(".product")];

function filter(query) {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const card of cards) {
    const hit = !q || card.textContent.toLowerCase().includes(q);
    card.hidden = !hit;
    if (hit) shown++;
  }
  empty.hidden = shown > 0;
  return shown;
}

input.addEventListener("input", () => filter(input.value));
input.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  input.value = "";
  filter("");
});
`;

export const SIFT_HTML_V2 = `<input id="search" type="search"
       placeholder="Search products"
       aria-label="Search products">
<p id="no-results" role="status" hidden>
  No products match your search.
</p>
`;

export const SIFT_RESOLVED = `<h1>Corner Shop</h1>
<input id="search" type="search"
       placeholder="Search products"
       aria-label="Search products">
<a class="cart" href="#cart">
  Cart <span id="cart-count">0</span>
</a>
`;

export const LEDGER_JS = `const cart = JSON.parse(localStorage.getItem("cart") ?? "[]");
const badge = document.querySelector("#cart-count");

function render() {
  const count = cart.reduce((n, item) => n + item.qty, 0);
  badge.textContent = count;
  localStorage.setItem("cart", JSON.stringify(cart));
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const id = btn.dataset.add;
  const line = cart.find((i) => i.id === id);
  line ? line.qty++ : cart.push({ id, qty: 1 });
  render();
});

render();
`;

export const LEDGER_HTML = `<a class="cart" href="#cart">
  Cart <span id="cart-count">0</span>
</a>
`;
