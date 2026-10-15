/* The hero: BALLAST as heavy type tiles you can pick up and throw. Boots the world, runs the loop,
   wires the pointer and the two buttons. With reduced motion it draws one settled still frame. */
(function (B) {
  var canvas, ctx, hero, nav, base, world, W = 0, H = 0, dpr = 1, tileH = 0;
  var raf = 0, last = 0, visible = true, timers = [];

  function stage() {
    return { top: nav.offsetHeight + 8, floor: base.offsetTop };
  }

  function fill(settle) { // drop the loose specimen glyphs onto the wordmark
    var size = B.extraSize(tileH), n = 0;
    timers.forEach(clearTimeout);
    timers = [];
    B.EXTRAS.forEach(function (g, i) {
      var x = W * (0.12 + ((i * 0.37 + 0.11) % 0.76)), y = -size.H - i * size.H * 0.4;
      var add = function () { world.spawn(g, x, y, size); n++; };
      if (settle) { y = H * 0.1 - i * size.H * 0.9; add(); } else timers.push(setTimeout(add, 1700 + i * 260));
    });
    if (settle) world.settle(4);
  }

  function resize(first) {
    var w = hero.clientWidth, h = hero.clientHeight, s;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!first && Math.abs(w - W) < 2 && Math.abs(h - H) < 2) return;
    var sameWidth = !first && Math.abs(w - W) < 2;
    W = w; H = h;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    s = stage();
    var lay = B.layout(W, s.top, s.floor);
    tileH = lay.H;
    if (sameWidth) { world.retarget(lay, s.floor); return; }
    world.build(lay, W, s.floor);
    if (first && !B.reduced) { world.enter(); fill(false); } else fill(true);
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    world.update(dt);
    B.draw(ctx, world, W, H);
  }

  function run() {
    if (raf || B.reduced || !visible) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function wire() {
    canvas.addEventListener("pointerdown", function (e) {
      var p = pos(e);
      if (e.button > 0 || !world.grab(p.x, p.y)) return;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      document.body.classList.add("is-played");
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      var p = pos(e);
      if (world.held) world.move(p.x, p.y);
      else canvas.style.cursor = world.pick(p.x, p.y) ? "grab" : "default";
    });
    function letGo() {
      world.release();
      canvas.style.cursor = "default";
    }
    canvas.addEventListener("pointerup", letGo);
    canvas.addEventListener("pointercancel", letGo);
    // Touch: stop the page scrolling only when a finger lands on a tile.
    canvas.addEventListener("touchstart", function (e) {
      var r = canvas.getBoundingClientRect(), t = e.touches[0];
      if (world.pick(t.clientX - r.left, t.clientY - r.top)) e.preventDefault();
    }, { passive: false });

    document.querySelector('[data-act="tidy"]').addEventListener("click", function () { world.tidy(); });
    document.querySelector('[data-act="shake"]').addEventListener("click", function () {
      document.body.classList.add("is-played");
      world.shake();
    });

    new ResizeObserver(function () { resize(false); }).observe(hero);
    new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      if (visible) run(); else stop();
    }).observe(hero);
  }

  B.boot = function () {
    canvas = document.getElementById("stage");
    hero = canvas.parentElement;
    nav = document.querySelector(".nav");
    base = hero.querySelector(".hero__base");
    ctx = canvas.getContext("2d");
    world = new B.World();
    B.world = world;
    var tries = 0;
    var go = function () {
      // The stage can report a near-zero width for a frame or two after load (fonts, emulation, iframes): wait for it.
      if (hero.clientWidth < 200 && tries++ < 30) { requestAnimationFrame(go); return; }
      resize(true);
      if (B.reduced) {
        B.draw(ctx, world, W, H);
        window.addEventListener("resize", function () { resize(true); B.draw(ctx, world, W, H); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { B.draw(ctx, world, W, H); });
        return;
      }
      wire();
      run();
    };
    var ready = document.fonts && document.fonts.load ? document.fonts.load("900 100px Archivo") : Promise.resolve();
    Promise.race([ready, new Promise(function (r) { setTimeout(r, 1200); })]).then(go, go);
  };
})(window.Ballast);
