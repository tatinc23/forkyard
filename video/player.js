// Browser playback helper (not used by the renderer). Open film.html in a browser: space = play/pause with audio.
(function () {
  const Q = new URLSearchParams(location.search);
  if (Q.get("render") === "1" || navigator.webdriver) return;
  document.body.classList.add("fit");
  let t = 0, playing = false, last = 0, ac = null, src = null, buf = null;
  const dur = TIMELINE.dur;
  async function ensureAudio() {
    if (buf || typeof buildAudio !== "function") return;
    buf = await buildAudio({ cues: true, bed: true });
  }
  async function play() {
    await ensureAudio();
    ac = ac || new AudioContext();
    if (buf) { src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); src.start(0, t); }
    playing = true; last = performance.now(); loop();
  }
  function pause() { playing = false; try { src && src.stop(); } catch (e) {} }
  function loop() {
    if (!playing) return;
    const now = performance.now(); t += (now - last) / 1000; last = now;
    if (t >= dur) { t = dur - 0.001; pause(); }
    seek(t); requestAnimationFrame(loop);
  }
  addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
    if (e.code === "ArrowRight") { const p = playing; pause(); t = Math.min(dur - 0.01, t + 1); seek(t); if (p) play(); }
    if (e.code === "ArrowLeft") { const p = playing; pause(); t = Math.max(0, t - 1); seek(t); if (p) play(); }
    if (e.key === "r") { const u = new URL(location.href); u.searchParams.set("reduced", RM ? "0" : "1"); location.href = u; }
    if (e.key === "c") { const u = new URL(location.href); u.searchParams.set("captions", Q.get("captions") === "0" ? "1" : "0"); location.href = u; }
  });
})();
