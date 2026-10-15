// Forkyard film: design tokens. Single source for film.html, directions.html and the contrast check.
// Grounded in Cloudflare's "Build the next GitHub" contest page: warm white editorial ground, Cloudflare orange
// + yellow, bar-glyph block art. One accent family (orange); everything else is neutral ink and sand.
(function (g) {
  const TOKENS = {
    color: {
      paper: "#FBF7F0",      // ground
      paper2: "#F3ECE0",     // panels
      line: "#D9CDB8",       // hairlines, lane outlines
      sand: "#E3D6BD",       // neutral blocks (humans, base history)
      ink: "#1F1A14",        // text, strong shapes
      muted: "#5E564B",      // secondary text (>= 4.5:1 on paper)
      orange: "#F6821F",     // THE accent (shapes only, never small text)
      orangeDeep: "#A84A06", // accent for text and thin strokes (>= 4.5:1 on paper)
      yellow: "#FBAD41"      // second tint of the accent family (shapes only)
    },
    type: {
      serif: "Newsreader, Georgia, serif",         // headlines, captions
      mono: "'JetBrains Mono', Menlo, monospace"   // labels, code, data
    },
    // type scale on the 1920x1080 master. Anchors stay >= 44 px so they read at 390 px wide.
    size: { headline: 80, sub: 46, caption: 44, label: 34, micro: 28 },
    grid: { w: 1920, h: 1080, margin: 96, cols: 12, unit: 8,
            stage: { x: 96, y: 275, w: 1728, h: 600 }, captionY: 905 },
    motion: {
      // cubic-bezier control points; none overshoot, so nothing bounces
      inOut: [0.65, 0, 0.35, 1], out: [0.16, 1, 0.3, 1], in: [0.7, 0, 0.84, 0]
    },
    bpm: 96
  };
  g.TOKENS = TOKENS;
  if (typeof module !== "undefined") module.exports = TOKENS;
})(typeof window !== "undefined" ? window : globalThis);
