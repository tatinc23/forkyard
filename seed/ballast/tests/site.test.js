// Starter tests (vitest). QA crew: add one small test per backlog item.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mosaicSrc = readFileSync(new URL("../src/mosaic.js", import.meta.url), "utf8");

describe("site", () => {
  it("carries the footer line and no other branding", () => {
    expect(html).toContain("A fictional foundry. Demo repository for Forkyard.");
    expect(html).toContain("Ballast Type Co.");
  });

  it("keeps src/mosaic.js in the fixed slot format", () => {
    const lines = mosaicSrc.split("\n");
    expect(lines[0]).toBe("var T = window.MOSAIC = [];");
    expect(lines[1]).toBe("var ROLL = [];");
    for (let i = 1; i <= 100; i++) {
      const n = String(i).padStart(3, "0");
      expect(mosaicSrc).toContain(`// slot ${n}\n`);
      expect(mosaicSrc).toMatch(new RegExp(`^T\\[${i}\\] = (null|\\{[^\\n]*\\});$`, "m"));
    }
  });

  it("evaluates to 100 slots", () => {
    const win = {};
    vm.runInNewContext(mosaicSrc + "\nwindow.__roll = ROLL;", { window: win });
    expect(win.MOSAIC.length).toBe(101);
    expect(Array.isArray(win.__roll)).toBe(true);
  });

  // slot:tests-html
  // slot:tests-css
  // slot:tests-js
  // slot:tests-worker
});
