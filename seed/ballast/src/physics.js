/* A tiny Verlet world. Each type tile is a capsule: two end particles joined by a rigid
   rod, plus a radius. Docked tiles sit still and act as walls; free tiles tumble. */
(function (T) {
  var C = T.cfg, clamp = T.clamp, nearest = T.geom.nearest, closest = T.geom.closest;

  function P() { this.x = this.y = this.px = this.py = 0; }
  P.prototype.set = function (x, y) { this.x = this.px = x; this.y = this.py = y; };

  function Body(s) {
    this.glyph = s.glyph; this.tone = s.tone; this.idx = s.idx; this.w = s.w; this.r = s.r; this.row = s.row; this.t = s.target || null;
    this.L = Math.max(1, s.w - 2 * s.r);
    this.a = new P(); this.b = new P();
    this.mode = s.target ? "dock" : "free"; // drop | dock | tidy | free
    this.flash = 0; this.delay = 0; this.oy = 0; this.vy = 0;
  }
  Body.prototype.place = function (dy) {
    if (!this.t) return;
    this.a.set(this.t.ax, this.t.ay + dy);
    this.b.set(this.t.bx, this.t.by + dy);
  };
  Body.prototype.thaw = function () {
    this.mode = "free";
    this.a.px = this.a.x; this.a.py = this.a.y;
    this.b.px = this.b.x; this.b.py = this.b.y;
  };

  function integrate(p, h) {
    var vx = (p.x - p.px) * C.damping, vy = (p.y - p.py) * C.damping;
    var v = Math.sqrt(vx * vx + vy * vy);
    if (v > C.maxStep) { vx *= C.maxStep / v; vy *= C.maxStep / v; }
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + C.gravity * h * h;
  }

  function World() {
    this.bodies = []; this.sparks = []; this.held = null;
    this.acc = 0; this.W = 0; this.floor = 0; this.fs = 100;
  }

  World.prototype.build = function (lay, W, floor) {
    this.W = W; this.floor = floor; this.fs = lay.fs; this.held = null; this.sparks.length = 0;
    this.bodies = lay.specs.map(function (s) { var b = new Body(s); b.place(0); return b; });
  };

  /* Same width, new height: move the shelf and the docked tiles, keep free ones. */
  World.prototype.retarget = function (lay, floor) {
    this.floor = floor; this.fs = lay.fs;
    this.bodies.forEach(function (b) {
      if (b.idx === undefined) return;
      b.t = lay.specs[b.idx].target;
      if (b.mode === "dock") b.place(0);
    });
  };

  World.prototype.enter = function () {
    this.bodies.forEach(function (b) {
      if (!b.t) return;
      b.mode = "drop"; b.vy = 0;
      b.delay = 0.1 + b.row * 0.22 + b.t.ax / 8000;
      b.oy = -(Math.max(b.t.ay, b.t.by) + b.r + 80);
      b.place(b.oy);
    });
  };

  World.prototype.spark = function (x, y, nx, ny, speed, n) {
    for (var i = 0; i < n && this.sparks.length < 220; i++) {
      var ang = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.2;
      var v = speed * (0.25 + Math.random() * 0.5), life = 0.35 + Math.random() * 0.4;
      this.sparks.push({ x: x, y: y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 120, life: life, max: life });
    }
  };

  World.prototype.hit = function (b, speed, x, y, nx, ny) {
    if (speed < 380) return;
    b.flash = Math.min(1, b.flash + clamp(speed / 1800, 0, 0.8));
    this.spark(x, y, nx, ny, Math.min(speed, 1400), Math.min(9, (speed / 160) | 0));
  };

  World.prototype.dropStep = function (b, dt) {
    if (b.delay > 0) { b.delay -= dt; if (b.delay > 0) return; }
    b.vy += 2800 * dt; b.oy += b.vy * dt;
    if (b.oy >= 0) {
      b.oy = 0;
      if (b.vy > 300) {
        this.hit(b, b.vy, (b.t.ax + b.t.bx) / 2, (b.t.ay + b.t.by) / 2 + b.r, 0, -1);
        b.vy *= -0.3;
      } else {
        b.mode = "dock"; b.vy = 0;
      }
    }
    b.place(b.oy);
  };

  World.prototype.tidyStep = function (b, dt) {
    var k = 1 - Math.exp(-dt * 10), t = b.t, a = b.a, c = b.b;
    a.x += (t.ax - a.x) * k; a.y += (t.ay - a.y) * k;
    c.x += (t.bx - c.x) * k; c.y += (t.by - c.y) * k;
    a.px = a.x; a.py = a.y; c.px = c.x; c.py = c.y;
    if (Math.abs(t.ax - a.x) + Math.abs(t.ay - a.y) + Math.abs(t.bx - c.x) + Math.abs(t.by - c.y) < 1) {
      b.place(0); b.mode = "dock";
    }
  };

  World.prototype.update = function (dt) {
    var self = this, n = 0, i, s;
    this.bodies.forEach(function (b) {
      if (b.mode === "drop") self.dropStep(b, dt);
      else if (b.mode === "tidy") self.tidyStep(b, dt);
    });
    this.acc += dt;
    while (this.acc >= C.step && n < 6) { this.sub(C.step); this.acc -= C.step; n++; }
    if (n === 6) this.acc = 0;

    this.bodies.forEach(function (b) { b.flash = Math.max(0, b.flash - C.flashDecay * dt); });
    for (i = this.sparks.length - 1; i >= 0; i--) {
      s = this.sparks[i]; s.life -= dt;
      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
      s.vy += 1800 * dt; s.vx *= 0.99; s.x += s.vx * dt; s.y += s.vy * dt;
    }
  };

  World.prototype.sub = function (h) {
    var B = this.bodies, i, j, it, b;
    for (i = 0; i < B.length; i++) if (B[i].mode === "free") { integrate(B[i].a, h); integrate(B[i].b, h); }
    if (this.held) this.pull();
    for (it = 0; it < C.iterations; it++) {
      for (i = 0; i < B.length; i++) {
        b = B[i];
        if (b.mode !== "free") continue;
        this.rod(b); this.bounds(b, h);
      }
      for (i = 0; i < B.length; i++) for (j = i + 1; j < B.length; j++) this.collide(B[i], B[j], h, it === 0);
    }
  };

  World.prototype.rod = function (b) {
    var a = b.a, c = b.b, dx = c.x - a.x, dy = c.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
    var f = (d - b.L) / d * 0.5;
    a.x += dx * f; a.y += dy * f; c.x -= dx * f; c.y -= dy * f;
  };

  World.prototype.bounds = function (b, h) {
    var ps = [b.a, b.b], r = b.r, k, p, v, lim = this.floor - r;
    for (k = 0; k < 2; k++) {
      p = ps[k];
      if (p.y > lim) {
        v = p.y - p.py; p.y = lim;
        p.py = p.y + (v / h > 300 ? v * C.restitution : 0);
        p.px = p.x - (p.x - p.px) * C.friction;
        this.hit(b, v / h, p.x, p.y + r, 0, -1);
      }
      if (p.x < r) {
        v = p.x - p.px; p.x = r; p.px = p.x + (-v / h > 300 ? v * C.restitution : 0);
        this.hit(b, -v / h, 0, p.y, 1, 0);
      } else if (p.x > this.W - r) {
        v = p.x - p.px; p.x = this.W - r; p.px = p.x + (v / h > 300 ? v * C.restitution : 0);
        this.hit(b, v / h, this.W, p.y, -1, 0);
      }
    }
  };

  function kind(b) { return b.mode === "free" ? 1 : b.mode === "dock" ? 0 : -1; }

  World.prototype.collide = function (A, B, h, first) {
    var ka = kind(A), kb = kind(B);
    if (ka < 0 || kb < 0 || (ka === 0 && kb === 0)) return;
    var st = closest(A.a, A.b, B.a, B.b), s = st[0], t = st[1];
    var px = A.a.x + (A.b.x - A.a.x) * s, py = A.a.y + (A.b.y - A.a.y) * s;
    var qx = B.a.x + (B.b.x - B.a.x) * t, qy = B.a.y + (B.b.y - B.a.y) * t;
    var nx = qx - px, ny = qy - py, d = Math.sqrt(nx * nx + ny * ny), rr = A.r + B.r;
    if (d >= rr) return;
    if (d < 1e-4) { nx = 0; ny = -1; d = 0; } else { nx /= d; ny /= d; }
    var wa = ka ? (1 - s) * (1 - s) + s * s : 0, wb = kb ? (1 - t) * (1 - t) + t * t : 0;
    var lam = (rr - d) / (wa + wb);
    if (first) { // closing speed along the contact normal, before we correct anything
      var vax = ((A.a.x - A.a.px) * (1 - s) + (A.b.x - A.b.px) * s) / h, vay = ((A.a.y - A.a.py) * (1 - s) + (A.b.y - A.b.py) * s) / h;
      var vbx = ((B.a.x - B.a.px) * (1 - t) + (B.b.x - B.b.px) * t) / h, vby = ((B.a.y - B.a.py) * (1 - t) + (B.b.y - B.b.py) * t) / h;
      var close = (vax - vbx) * nx + (vay - vby) * ny;
      if (close > 380) {
        if (ka) this.hit(A, close, px + nx * A.r, py + ny * A.r, -nx, -ny);
        if (kb) this.hit(B, close, px + nx * A.r, py + ny * A.r, -nx, -ny);
      }
    }
    if (ka) {
      A.a.x -= nx * lam * (1 - s); A.a.y -= ny * lam * (1 - s); A.b.x -= nx * lam * s; A.b.y -= ny * lam * s;
      if (first) this.soak(A);
    }
    if (kb) {
      B.a.x += nx * lam * (1 - t); B.a.y += ny * lam * (1 - t); B.b.x += nx * lam * t; B.b.y += ny * lam * t;
      if (first) this.soak(B);
    }
  };

  World.prototype.soak = function (b) { // contact friction
    [b.a, b.b].forEach(function (p) {
      p.px = p.x - (p.x - p.px) * C.contactDamp; p.py = p.y - (p.y - p.py) * C.contactDamp;
    });
  };

  World.prototype.pull = function () {
    var H = this.held, b = H.b, s = H.s, w = (1 - s) * (1 - s) + s * s, k = 0.3;
    var dx = H.x - (b.a.x * (1 - s) + b.b.x * s), dy = H.y - (b.a.y * (1 - s) + b.b.y * s);
    b.a.x += dx * k * (1 - s) / w; b.a.y += dy * k * (1 - s) / w;
    b.b.x += dx * k * s / w; b.b.y += dy * k * s / w;
  };

  World.prototype.pick = function (x, y) {
    for (var i = this.bodies.length - 1; i >= 0; i--) {
      var b = this.bodies[i];
      if (b.mode === "drop") continue;
      var n = nearest(x, y, b);
      if (n.d <= b.r) return { body: b, s: n.t };
    }
    return null;
  };

  World.prototype.grab = function (x, y) {
    var h = this.pick(x, y);
    if (!h) return false;
    if (h.body.mode !== "free") h.body.thaw();
    this.bodies.splice(this.bodies.indexOf(h.body), 1);
    this.bodies.push(h.body); // draw on top
    this.held = { b: h.body, s: h.s, x: x, y: y };
    return true;
  };

  World.prototype.move = function (x, y) { if (this.held) { this.held.x = x; this.held.y = y; } };
  World.prototype.release = function () { this.held = null; };

  World.prototype.shake = function () {
    this.held = null;
    this.bodies.forEach(function (b) {
      if (b.mode === "drop") return;
      if (b.mode !== "free") b.thaw();
      var vx = (Math.random() - 0.5) * 12, vy = -(7 + Math.random() * 6);
      b.a.px = b.a.x - vx; b.a.py = b.a.y - vy;
      b.b.px = b.b.x - vx - (Math.random() - 0.5) * 5; b.b.py = b.b.y - vy - (Math.random() - 0.5) * 3;
      b.flash = Math.min(1, b.flash + 0.3);
    });
  };

  World.prototype.tidy = function () {
    this.held = null;
    this.bodies.forEach(function (b) { if (b.t && b.mode !== "drop") b.mode = "tidy"; });
  };

  /* A loose specimen tile, dropped from (x, y) with a little spin. */
  World.prototype.spawn = function (g, x, y, size) {
    var b = new Body({ glyph: g.g, tone: g.tone, w: size.w, r: size.r, row: 0 });
    var L = b.L / 2, ang = (Math.random() - 0.5) * 1.6;
    b.a.set(x - Math.cos(ang) * L, y - Math.sin(ang) * L);
    b.b.set(x + Math.cos(ang) * L, y + Math.sin(ang) * L);
    var spin = (Math.random() - 0.5) * 6;
    b.a.py -= spin; b.b.py += spin; // spin + a short push so they do not stack in one column
    b.a.px += (Math.random() - 0.5) * 4; b.b.px = b.a.px;
    this.bodies.push(b);
    return b;
  };

  /* Run the simulation without drawing, so a still frame can show a natural pile. */
  World.prototype.settle = function (seconds) {
    for (var t = 0; t < seconds; t += 1 / 60) this.update(1 / 60);
    this.sparks.length = 0;
  };

  T.World = World;
})(window.Ballast);
