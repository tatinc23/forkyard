/* Motion crew. Everything here must respect Ballast.reduced (prefers-reduced-motion).
   Add each effect as its own function and call it from init(). */
(function (B) {
  B.motion = {
    init: function () {
      if (B.reduced) return; // reduced-motion path: nothing animates beyond the still hero
      // slot:motion-reveal  (scroll-linked reveals for the .sec sections)
      // slot:motion-hover   (specimen card hover interactions)
      // slot:motion-cursor  (pointer effect)
      // slot:motion-nav     (nav gets .is-stuck after the hero scrolls away)
    }
  };
  // slot:motion-helpers
})(window.Ballast);
