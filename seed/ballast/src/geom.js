/* Small geometry helpers for the physics world. */
(function (T) {
  var clamp = T.clamp;

  function nearest(x, y, b) {
    var a = b.a, c = b.b, dx = c.x - a.x, dy = c.y - a.y, l = dx * dx + dy * dy;
    var t = l ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l, 0, 1) : 0;
    return { t: t, d: Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)) };
  }

  /* Closest points between two segments (Ericson). Returns [s, t]. */
  function closest(p1, q1, p2, q2) {
    var d1x = q1.x - p1.x, d1y = q1.y - p1.y, d2x = q2.x - p2.x, d2y = q2.y - p2.y;
    var rx = p1.x - p2.x, ry = p1.y - p2.y;
    var a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
    var s = 0, t = 0, c, b, den;
    if (a < 1e-6 && e < 1e-6) return [0, 0];
    if (a < 1e-6) return [0, clamp(f / e, 0, 1)];
    c = d1x * rx + d1y * ry;
    if (e < 1e-6) return [clamp(-c / a, 0, 1), 0];
    b = d1x * d2x + d1y * d2y;
    den = a * e - b * b;
    s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
    else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    return [s, t];
  }

  T.geom = { nearest: nearest, closest: closest };
})(window.Ballast);
