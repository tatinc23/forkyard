/* Renders #mosaic-grid from window.MOSAIC (src/mosaic.js). Empty slots are outlined cells; a filled slot
   is { g, h, by }: glyph g in hue h, with the contributor's name (by) shown on hover or focus. */
(function (B) {
  function render() {
    var grid = document.getElementById("mosaic-grid");
    if (!grid) return;
    var T = window.MOSAIC || [], roll = window.ROLL || [], done = 0, i, cell, t, g, by;
    grid.textContent = "";
    for (i = 1; i <= 100; i++) {
      t = T[i];
      cell = document.createElement("li");
      cell.className = "mosaic__cell";
      if (t && t.g) {
        done++;
        cell.className += " is-set";
        cell.style.setProperty("--h", String(Number(t.h) || 0));
        cell.title = t.by ? "Set by " + t.by : "Set";
        g = document.createElement("span");
        g.className = "mosaic__glyph";
        g.textContent = String(t.g).slice(0, 2);
        cell.appendChild(g);
        if (t.by) {
          by = document.createElement("span");
          by.className = "mosaic__by";
          by.textContent = t.by;
          cell.appendChild(by);
        }
      } else {
        cell.textContent = String(i);
      }
      grid.appendChild(cell);
    }
    var count = document.getElementById("mosaic-count");
    if (count) count.textContent = done + " of 100 set";
    var credits = document.getElementById("mosaic-roll");
    if (credits) credits.textContent = roll.length ? "Set by " + roll.join(", ") + "." : "No hands yet. Every cell is open.";
  }
  B.mosaic = { render: render };
})(window.Ballast);
