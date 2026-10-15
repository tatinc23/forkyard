/* Draws the world: floor shadows, extruded type tiles, chips thrown off hard impacts. */
(function (B) {
  var CORNER = 0.8; // tile corner radius as a share of the capsule radius

  function tilePath(ctx, hw, r) {
    var c = r * CORNER;
    ctx.beginPath();
    ctx.moveTo(-hw + c, -r);
    ctx.lineTo(hw - c, -r);
    ctx.arcTo(hw, -r, hw, -r + c, c);
    ctx.lineTo(hw, r - c);
    ctx.arcTo(hw, r, hw - c, r, c);
    ctx.lineTo(-hw + c, r);
    ctx.arcTo(-hw, r, -hw, r - c, c);
    ctx.lineTo(-hw, -r + c);
    ctx.arcTo(-hw, -r, -hw + c, -r, c);
    ctx.closePath();
  }

  function floorShadow(ctx, b, floor) {
    var low = Math.max(b.a.y, b.b.y) + b.r, gap = floor - low;
    if (gap > 360) return;
    var cx = (b.a.x + b.b.x) / 2, rx = b.w * 0.55, ry = 10 + Math.min(gap, 200) * 0.05;
    ctx.save();
    ctx.translate(cx, floor);
    ctx.scale(rx, ry);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(0,0,0," + (0.5 * (1 - gap / 360)) + ")");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function tile(ctx, b) {
    var cx = (b.a.x + b.b.x) / 2, cy = (b.a.y + b.b.y) / 2;
    var ang = Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x);
    var r = b.r, hw = b.w / 2, tone = B.tones[b.tone] || B.tones.chalk, f = b.flash;
    var depth = Math.max(4, r * 0.2);
    var face = B.mix(tone.face, [255, 236, 170], f * 0.55);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);

    // The slug's thickness always falls straight down the screen, whatever the tile's angle.
    var dx = Math.sin(ang), dy = Math.cos(ang), i, steps = 7;
    ctx.fillStyle = B.rgb(tone.edge);
    for (i = steps; i >= 1; i--) {
      ctx.save();
      ctx.translate(dx * depth * i / steps, dy * depth * i / steps);
      tilePath(ctx, hw, r);
      ctx.fill();
      ctx.restore();
    }

    tilePath(ctx, hw, r);
    var g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, B.rgb(B.mix(face, [255, 255, 255], 0.22)));
    g.addColorStop(0.55, B.rgb(face));
    g.addColorStop(1, B.rgb(B.mix(face, tone.edge, 0.18)));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = f > 0.04 ? "rgba(255,214,90," + (0.4 + f * 0.6) + ")" : B.rgb(B.mix(tone.face, [255, 255, 255], 0.5), 0.55);
    ctx.stroke();

    // Letterpress: the glyph, with a hairline of light under it.
    var fs = r * 2 * 0.94 * (b.glyph.length > 1 ? 0.72 : 1);
    B.setFont(ctx, fs);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    var ty = fs * 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillText(b.glyph, 0, ty + 1.5);
    ctx.fillStyle = B.rgb(tone.ink);
    ctx.fillText(b.glyph, 0, ty);
    ctx.restore();
  }

  B.draw = function (ctx, world, W, H) {
    ctx.clearRect(0, 0, W, H);
    var i, s, a, bs = world.bodies;
    for (i = 0; i < bs.length; i++) floorShadow(ctx, bs[i], world.floor);
    for (i = 0; i < bs.length; i++) tile(ctx, bs[i]);
    for (i = 0; i < world.sparks.length; i++) {
      s = world.sparks[i];
      a = s.life / s.max;
      ctx.fillStyle = "rgba(" + (a > 0.5 ? "244,196,48" : "232,236,231") + "," + a + ")";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.5 + 2.5 * a, 0, Math.PI * 2);
      ctx.fill();
    }
  };
})(window.Ballast);
