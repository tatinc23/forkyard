/** The finished Corner Shop page that the mock job "built". Opened in a new tab by "Open the result" when running on demo data. */
export function mockPreviewHtml(): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Corner Shop (demo result)</title>
<style>
:root{--bg:#fbfaf8;--ink:#17181c;--accent:#f6821f;color-scheme:light dark}
[data-theme=dark]{--bg:#121317;--ink:#ecebe8;--accent:#ffa24d}
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--ink);transition:background .2s,color .2s}
header{display:flex;gap:1rem;align-items:center;flex-wrap:wrap;padding:1rem 1.25rem;border-bottom:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}
h1{margin:0;font-size:1.25rem;flex:1}
input{padding:.4rem .7rem;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit}
button,.cart{border:1px solid currentColor;border-radius:999px;padding:.25rem .75rem;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:none}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;padding:1.25rem}
.product{border:1px solid color-mix(in srgb,var(--ink) 18%,transparent);border-radius:12px;padding:1rem}
.product button{margin-top:.5rem;border-color:var(--accent);color:var(--accent)}
p[hidden]{display:none}.note{padding:0 1.25rem;opacity:.7;font-size:.85rem}
</style></head><body>
<header><h1>Corner Shop</h1>
<input id="search" type="search" placeholder="Search products" aria-label="Search products">
<a class="cart" href="#cart">Cart <span id="cart-count">0</span></a>
<button class="theme-toggle" aria-pressed="false">Dark mode</button></header>
<main>
<div class="product"><strong>Brass lantern</strong><br>$24<br><button data-add="lantern">Add</button></div>
<div class="product"><strong>Linen apron</strong><br>$32<br><button data-add="apron">Add</button></div>
<div class="product"><strong>Oak spoon set</strong><br>$18<br><button data-add="spoons">Add</button></div>
<div class="product"><strong>Enamel mug</strong><br>$14<br><button data-add="mug">Add</button></div>
</main>
<p id="no-results" role="status" hidden class="note">No products match your search.</p>
<p class="note">Demo result built from Forkyard's mock job. Press Esc in the search box to clear it.</p>
<script>
const root=document.documentElement;
document.querySelector(".theme-toggle").onclick=e=>{const d=root.dataset.theme!=="dark";root.dataset.theme=d?"dark":"light";e.currentTarget.setAttribute("aria-pressed",d)};
const input=document.querySelector("#search"),empty=document.querySelector("#no-results"),cards=[...document.querySelectorAll(".product")];
function filter(q){q=q.trim().toLowerCase();let s=0;for(const c of cards){const h=!q||c.textContent.toLowerCase().includes(q);c.hidden=!h;if(h)s++}empty.hidden=s>0}
input.addEventListener("input",()=>filter(input.value));
input.addEventListener("keydown",e=>{if(e.key==="Escape"){input.value="";filter("")}});
let count=0;const badge=document.querySelector("#cart-count");
document.addEventListener("click",e=>{if(e.target.closest("[data-add]")){count++;badge.textContent=count}});
</script></body></html>`;
}
