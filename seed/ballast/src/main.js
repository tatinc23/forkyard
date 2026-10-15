/* Entry point. Runs after the other scripts (all are deferred, in order). */
(function (B) {
  B.boot();
  B.mosaic.render();
  B.motion.init();
  // slot:main-init
})(window.Ballast);
