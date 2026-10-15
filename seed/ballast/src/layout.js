/* The wordmark as tiles, and where they rest. BALLAST sits in two rows (BAL over LAST) on the shelf,
   sized to the stage. Loose specimen glyphs are dropped on top of it. */
(function (B) {
  B.LETTERS = "BALLAST".split("");
  B.ROWS = [[0, 1, 2], [3, 4, 5, 6]]; // BAL / LAST
  B.EXTRAS = [
    { g: "&", tone: "buoy" }, { g: "g", tone: "minium" }, { g: "Q", tone: "tide" }, { g: "¶", tone: "hull" },
    { g: "R", tone: "buoy" }, { g: "fi", tone: "tide" }, { g: "@", tone: "minium" }, { g: "?", tone: "hull" }
  ];

  var ASPECT = 1.2; // tile width / height
  var GAP = 0.07; // gap between tiles, in tile heights
  var TILTS = [-0.02, 0.014, -0.012]; // radians, upper row only

  /* Returns { H, specs }. top/bottom bound the stage in canvas pixels. */
  B.layout = function (W, top, bottom) {
    W = Math.max(W, 280); // never lay out against a not-yet-sized stage
    var maxW = W - Math.max(12, W * 0.045) * 2;
    var asp = W < 600 ? 1.05 : ASPECT; // squarer tiles on phones so the wordmark can be bigger
    var availH = Math.max(bottom - top, 200);
    var widest = Math.max(B.ROWS[0].length, B.ROWS[1].length);
    var byWidth = maxW / (widest * asp + (widest - 1) * GAP);
    var byHeight = (availH * 0.72) / (2 + GAP);
    var H = Math.floor(B.clamp(Math.min(byWidth, byHeight), 36, 300));
    var r = H / 2, gap = GAP * H, w = asp * H, specs = [];
    var cur = bottom;
    for (var k = B.ROWS.length - 1; k >= 0; k--) {
      var row = B.ROWS[k], rowW = row.length * w + (row.length - 1) * gap;
      var rise = 0;
      if (k === 0) rise = Math.abs(Math.sin(TILTS[0])) * (w - H) / 2;
      var cy = cur - rise - r, x = (W - rowW) / 2;
      row.forEach(function (idx, n) {
        var tilt = k === 0 ? TILTS[n] : 0;
        var half = (w - H) / 2, cx = x + w / 2;
        specs[idx] = {
          idx: idx, glyph: B.LETTERS[idx], w: w, r: r, tone: "chalk",
          row: B.ROWS.length - 1 - k, // 0 = bottom row, lands first
          target: {
            ax: cx - Math.cos(tilt) * half, ay: cy - Math.sin(tilt) * half,
            bx: cx + Math.cos(tilt) * half, by: cy + Math.sin(tilt) * half
          }
        };
        x += w + gap;
      });
      cur = cy - r - rise - GAP * H;
    }
    return { H: H, specs: specs };
  };

  /* Size of a loose specimen tile for a given wordmark tile height. */
  B.extraSize = function (H) {
    var h = Math.max(34, Math.round(H * 0.34));
    return { H: h, w: Math.round(h * ASPECT), r: h / 2 };
  };
})(window.Ballast);
