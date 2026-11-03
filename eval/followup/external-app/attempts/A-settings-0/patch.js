(function () {
  "use strict";

  var LABELS = [
    {
      id: "priority",
      match: "Minimum priority",
      title: "Which messages do you want to see?",
      descMatch: "regardless of",
      desc: "You are seeing everything right now. Choose a higher level if you'd rather only see more important messages."
    },
    {
      id: "sound",
      match: "Notification sound",
      title: "Sound when a message arrives",
      descMatch: "Ding sound",
      desc: "Play a short sound when a new message arrives. Open the sound choice to listen and pick your favourite."
    },
    {
      id: "delete",
      match: "Delete notifications",
      title: "How long should we keep messages?",
      descMatch: "auto-deleted",
      desc: "Old messages are tidied away automatically. Pick how long you'd like to keep them around."
    }
  ];

  var ORDER = ["priority", "sound", "delete"];

  function findLeafByExactText(text) {
    try {
      var els = document.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.childElementCount !== 0) continue;
        if (el.dataset && el.dataset.ntfyFriendly === "1") continue;
        var t = null;
        try { t = el.textContent; } catch (e) { continue; }
        if (t && t.trim() === text) return el;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function findLeafContaining(fragment) {
    try {
      var els = document.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.childElementCount !== 0) continue;
        var t = null;
        try { t = el.textContent; } catch (e) { continue; }
        if (t && t.indexOf(fragment) !== -1) return el;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function childOfAncestor(el, ancestor) {
    try {
      var node = el;
      while (node && node.parentElement && node.parentElement !== ancestor) {
        node = node.parentElement;
      }
      if (node && node.parentElement === ancestor) return node;
    } catch (e) { /* ignore */ }
    return null;
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    var first = nodes[0];
    var chain = [];
    var n = first;
    while (n) { chain.push(n); n = n.parentElement; }
    for (var i = 0; i < chain.length; i++) {
      var cand = chain[i];
      var ok = true;
      for (var j = 1; j < nodes.length; j++) {
        if (!cand.contains(nodes[j])) { ok = false; break; }
      }
      if (ok) return cand;
    }
    return null;
  }

  function applyOnce() {
    try {
      // Reword labels (match original or already-friendly text).
      LABELS.forEach(function (item) {
        var labelEl = findLeafByExactText(item.match);
        if (!labelEl) {
          labelEl = findLeafByExactText(item.title);
        }
        if (labelEl && labelEl.textContent.trim() !== item.title) {
          labelEl.textContent = item.title;
        }
        if (labelEl && labelEl.dataset) labelEl.dataset.ntfyFriendly = "1";
      });

      // Reword descriptions; keep the value control itself untouched.
      LABELS.forEach(function (item) {
        var descEl = findLeafContaining(item.descMatch);
        if (!descEl) {
          descEl = findLeafContaining(item.desc);
        }
        if (descEl && descEl.textContent.trim() !== item.desc) {
          // Only replace leaf text nodes so nested controls are never harmed.
          if (descEl.childElementCount === 0) descEl.textContent = item.desc;
        }
      });

      // Reorganize: order rows friendliest-first under their shared parent.
      var byId = {};
      var labelNodes = [];
      LABELS.forEach(function (item) {
        var el = findLeafByExactText(item.title) || findLeafByExactText(item.match);
        if (el) { byId[item.id] = el; labelNodes.push(el); }
      });
      if (labelNodes.length === LABELS.length) {
        var parent = commonAncestor(labelNodes);
        if (parent) {
          var rows = ORDER.map(function (id) {
            return childOfAncestor(byId[id], parent);
          });
          var distinct = rows.every(function (r) { return !!r; });
          if (distinct) {
            var seen = {};
            var ok = true;
            rows.forEach(function (r) {
              if (seen[r]) ok = false;
              seen[r] = true;
            });
            if (ok) {
              var current = Array.prototype.slice.call(parent.children);
              var wantFirst = rows[0];
              // Only move nodes when the order is wrong, to avoid churn.
              var orderNow = current.filter(function (c) { return seen[c]; });
              var inOrder = orderNow.length === rows.length &&
                orderNow.every(function (c, i) { return c === rows[i]; });
              if (!inOrder) {
                rows.forEach(function (r) {
                  try { parent.appendChild(r); } catch (e) { /* ignore */ }
                });
                // Keep focus where it was if reordering moved the focused row.
                void wantFirst;
              }
            }
          }
        }
      }
    } catch (e) { /* never break the page */ }
  }

  try {
    var scheduled = false;
    var scheduledFn = function () {
      scheduled = false;
      applyOnce();
    };
    var requestApply = function () {
      if (scheduled) return;
      scheduled = true;
      try {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(scheduledFn);
        else setTimeout(scheduledFn, 50);
      } catch (e) {
        setTimeout(scheduledFn, 50);
      }
    };

    applyOnce();
    if (typeof MutationObserver !== "undefined") {
      var observer = new MutationObserver(function () { requestApply(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    document.addEventListener("DOMContentLoaded", applyOnce);
    window.addEventListener("load", applyOnce);
    window.addEventListener("hashchange", function () { requestApply(); });
  } catch (e) { /* never throw at top level */ }
})();
