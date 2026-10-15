/* Shared namespace and helpers.
   Classic scripts, not ES modules: previews are served in a CSP sandbox (opaque origin),
   and a sandboxed page cannot fetch module scripts. Each file adds to window.Ballast. */
(function () {
  var B = (window.Ballast = window.Ballast || {});

  B.cfg = {
    gravity: 2600, // px/s^2
    step: 1 / 120, // fixed physics step, seconds
    iterations: 5,
    damping: 0.9995,
    restitution: 0.26,
    friction: 0.9, // horizontal velocity kept per step while touching the floor
    contactDamp: 0.98,
    maxStep: 24, // px per physics step, stops tunnelling
    flashDecay: 2.2 // impact flash lost per second
  };

  B.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  B.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };

  B.mix = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  B.rgb = function (c, alpha) {
    var s = Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]);
    return alpha === undefined ? "rgb(" + s + ")" : "rgba(" + s + "," + alpha + ")";
  };

  /* Tile colours: face, edge (the visible thickness of the slug) and glyph ink. */
  B.tones = {
    chalk: { face: [232, 236, 231], edge: [139, 154, 160], ink: [14, 26, 40] },
    buoy: { face: [244, 196, 48], edge: [166, 120, 14], ink: [14, 26, 40] },
    minium: { face: [228, 72, 42], edge: [128, 32, 18], ink: [244, 240, 232] },
    tide: { face: [127, 178, 214], edge: [52, 92, 126], ink: [14, 26, 40] },
    hull: { face: [34, 58, 84], edge: [6, 12, 20], ink: [232, 236, 231] }
  };

  /* Canvas font for tiles. fontStretch must be set after font: assigning font resets it. */
  B.setFont = function (ctx, px) {
    ctx.font = "900 " + px + "px Archivo, 'Arial Black', system-ui, sans-serif";
    try { ctx.fontStretch = "expanded"; } catch (e) { /* older engines keep the normal width */ }
  };
})();
