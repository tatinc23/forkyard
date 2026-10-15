// The demo codebase every Job starts from: a tiny storefront the hired agents improve.
// Kept small on purpose (fits in a prompt; merges are readable on screen).
import type { FileMap } from "../git/git";

export const ACME_FILES: FileMap = {
	"index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acme Supply Co.</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="logo" href="#">Acme Supply Co.</a>
    <nav class="nav">
      <a href="#">Shop</a>
      <a href="#">About</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <h1>Tools for people who build things</h1>
      <p>Hand-picked gear, shipped fast.</p>
    </section>

    <section class="products">
      <h2>Products</h2>
      <ul id="product-list" class="grid"></ul>
    </section>
  </main>

  <footer class="site-footer">
    <p>&copy; Acme Supply Co.</p>
  </footer>

  <script src="app.js"></script>
</body>
</html>
`,
	"styles.css": `* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #ffffff;
  color: #1a1a1a;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e5e5;
}

.logo {
  font-weight: 700;
  color: inherit;
  text-decoration: none;
}

.nav a {
  margin-left: 16px;
  color: inherit;
}

.hero {
  padding: 48px 24px;
}

.products {
  padding: 0 24px 48px;
}

.grid {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.card {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 16px;
}

.site-footer {
  padding: 24px;
  border-top: 1px solid #e5e5e5;
  color: #666666;
}
`,
	"app.js": `const products = [
  { id: 1, name: "Claw Hammer", price: 24 },
  { id: 2, name: "Tape Measure", price: 12 },
  { id: 3, name: "Cordless Drill", price: 89 },
  { id: 4, name: "Level", price: 18 },
  { id: 5, name: "Utility Knife", price: 9 },
  { id: 6, name: "Work Gloves", price: 15 }
];

function renderProducts(list) {
  const el = document.getElementById("product-list");
  el.innerHTML = list
    .map((p) => \`<li class="card"><h3>\${p.name}</h3><p>$\${p.price}</p></li>\`)
    .join("");
}

renderProducts(products);
`,
	"README.md": `# Acme Supply Co.

A tiny storefront.
`,
};

export const DEMO_GOAL = "Make the Acme store feel finished: add a dark mode toggle, a product search box, an add-to-cart button with a cart counter in the header, and a proper README.";
