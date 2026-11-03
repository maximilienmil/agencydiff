(function () {
  "use strict";

  var ROWS = [
    {
      key: "priority",
      match: /^\s*minimum\s*priority\s*$/i,
      label: "Which messages to show",
      descMatch: /showing all notifications/i,
      desc: "You're seeing every message, no matter how urgent. Pick a level to see only the important ones."
    },
    {
      key: "sound",
      match: /^\s*notification\s*sound\s*$/i,
      label: "Sound for new messages",
      descMatch: /notifications play the/i,
      desc: "Play a short sound when a new message arrives. You can change the sound anytime."
    },
    {
      key: "delete",
      match: /^\s*delete\s*notifications\s*$/i,
      label: "Tidy up old messages",
      descMatch: /auto-?deleted/i,
      desc: "Old messages are tidied away automatically. You can keep them longer, clear them sooner, or never clear them."
    }
  ];

  function leafElements() {
    try {
      return document.querySelectorAll("body span, body div, body label, body p, body h1, body h2, body h3, body h4, body legend");
    } catch (e) {
      return [];
    }
  }

  function findLabelEl(spec) {
    var els = leafElements();
    for (var i = 0; i < els.length; i++) {
      try {
        var el = els[i];
        if (el.childElementCount !== 0) continue;
        var t = (el.textContent || "").trim();
        if (!t) continue;
        if (t.length > 60) continue;
        if (spec.match.test(t)) return el;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function rowContainer(labelEl) {
    var n = labelEl;
    for (var d = 0; d < 7 && n && n !== document.body; d++) {
      try {
        n = n.parentElement;
        if (!n) return null;
        if (n.querySelector("select, input, button, [role='combobox'], [role='listbox'], [role='switch']")) return n;
      } catch (e) { return null; }
    }
    return labelEl.parentElement || null;
  }

  function friendlyDescFor(row, container, spec) {
    var els = container.querySelectorAll("span, div, p");
    for (var i = 0; i < els.length; i++) {
      try {
        var el = els[i];
        if (el.childElementCount !== 0) continue;
        if (el === row.labelEl) continue;
        var t = (el.textContent || "").trim();
        if (!t || t.length > 300) continue;
        if (spec.descMatch.test(t)) return el;
        // Fallback: a sentence-like sibling that is not the value control text
        if (row.fallbackDesc && el === row.fallbackDesc) return el;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function addIntro(rows) {
    try {
      if (!rows.length || !rows[0].container || !rows[0].container.parentElement) return;
      var parent = rows[0].container.parentElement;
      if (parent.querySelector("[data-friendly-settings-intro='1']")) return;
      var p = document.createElement("p");
      p.setAttribute("data-friendly-settings-intro", "1");
      p.textContent = "Choose how alerts look and sound \u2014 everything works just as before.";
      p.style.opacity = "0.8";
      p.style.margin = "0 0 8px 0";
      parent.insertBefore(p, parent.firstChild);
    } catch (e) { /* ignore */ }
  }

  function apply() {
    try {
      var found = [];
      for (var s = 0; s < ROWS.length; s++) {
        var spec = ROWS[s];
        var labelEl = findLabelEl(spec);
        if (!labelEl) continue;
        var container = rowContainer(labelEl);
        if (!container) continue;
        found.push({ spec: spec, labelEl: labelEl, container: container });
      }
      if (!found.length) return;

      // Reword labels + descriptions (keep every control untouched).
      for (var f = 0; f < found.length; f++) {
        (function (row) {
          try {
            if (row.labelEl.textContent.trim() !== row.spec.label) {
              row.labelEl.textContent = row.spec.label;
            }
            row.labelEl.setAttribute("data-friendly-settings", row.spec.key);
            var descEl = friendlyDescFor(row, row.container, row.spec);
            if (!descEl) {
              // Fallback: longest leaf-text sibling that is not the label.
              var best = null;
              var els = row.container.querySelectorAll("span, div, p");
              for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el.childElementCount !== 0 || el === row.labelEl) continue;
                var t = (el.textContent || "").trim();
                if (t.length > 20 && t.length < 300 && (!best || t.length > best.length)) best = t;
              }
              if (!best) return;
              for (var j = 0; j < els.length; j++) {
                var e2 = els[j];
                if (e2.childElementCount !== 0 || e2 === row.labelEl) continue;
                if ((e2.textContent || "").trim() === best && best !== row.spec.desc) {
                  descEl = e2;
                  break;
                }
              }
            }
            if (descEl && descEl.textContent.trim() !== row.spec.desc) {
              // Never overwrite the value control itself: skip controls.
              if (!descEl.querySelector("select, input, button")) {
                descEl.textContent = row.spec.desc;
              }
            }
          } catch (e) { /* ignore row */ }
        })(found[f]);
      }

      // Reorganize: friendliest-first order within the shared parent.
      try {
        var order = ["priority", "sound", "delete"];
        var byKey = {};
        found.forEach(function (r) { byKey[r.spec.key] = r; });
        var parents = {};
        found.forEach(function (r) {
          var p = r.container.parentElement;
          if (p) parents[r.spec.key] = p;
        });
        // Only reorder when all three share one parent.
        var ps = Object.keys(parents).map(function (k) { return parents[k]; });
        if (ps.length === found.length && found.length > 1) {
          var same = ps.every(function (p) { return p === ps[0]; });
          if (same) {
            order.forEach(function (k) {
              if (byKey[k]) ps[0].appendChild(byKey[k].container);
            });
          }
        }
        addIntro(found);
      } catch (e) { /* ignore reorder */ }
    } catch (e) { /* never break the page */ }
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    try {
      (window.requestAnimationFrame || function (fn) { return setTimeout(fn, 50); })(function () {
        scheduled = false;
        apply();
      });
    } catch (e) {
      scheduled = false;
    }
  }

  try {
    apply();
    var obs = new MutationObserver(function () { schedule(); });
    obs.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  } catch (e) { /* never throw */ }
})();
