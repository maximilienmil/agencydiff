(function () {
  "use strict";

  var ORDER = ["rename", "test", "mute", "clear", "unsub"];

  function keyFor(text) {
    var t = (text || "").toLowerCase();
    if (t.indexOf("display name") !== -1 || (t.indexOf("rename") !== -1)) return "rename";
    if (t.indexOf("test") !== -1) return "test";
    if (t.indexOf("clear") !== -1) return "clear";
    if (t.indexOf("unmute") !== -1) return "mute";
    if (t.indexOf("mute") !== -1) return "mute";
    if (t.indexOf("unsub") !== -1 || t.indexOf("remove subscription") !== -1 || t.indexOf("leave") !== -1) return "unsub";
    return null;
  }

  function friendlyLabel(key, raw) {
    var muted = /unmute/i.test(raw || "");
    if (key === "rename") return "\u270F\uFE0F Rename display name";
    if (key === "test") return "\uD83D\uDD14 Send a test notification";
    if (key === "clear") return "\uD83E\uDDF9 Clear all notifications";
    if (key === "mute") return muted ? "\uD83D\uDD14 Unmute notifications" : "\uD83D\uDD07 Mute notifications";
    if (key === "unsub") return "\uD83D\uDC4B Unsubscribe";
    return null;
  }

  function menuItems() {
    try {
      var items = document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], li[role="option"]');
      if (items && items.length) return Array.prototype.slice.call(items);
      var els = document.querySelectorAll("li, button");
      return Array.prototype.slice.call(els);
    } catch (e) {
      return [];
    }
  }

  function isTopicMenu(candidates) {
    var seen = {};
    candidates.forEach(function (el) {
      var k = keyFor(el.textContent || "");
      if (k) seen[k] = true;
    });
    var n = Object.keys(seen).length;
    return n >= 3 && !!seen.unsub;
  }

  function apply() {
    try {
      var all = menuItems();
      var byMenu = new Map();
      all.forEach(function (el) {
        var k = keyFor(el.textContent || "");
        if (!k) return;
        var menu = el.closest('[role="menu"], [role="menubar"], ul, div');
        var scope = menu || document.body;
        if (!byMenu.has(scope)) byMenu.set(scope, []);
        byMenu.get(scope).push(el);
      });
      byMenu.forEach(function (items, scope) {
        var keys = {};
        items.forEach(function (el) { keys[keyFor(el.textContent || "")] = true; });
        if (!(keys.unsub && Object.keys(keys).length >= 3)) return;
        // Reword in place (preserve nodes + listeners).
        items.forEach(function (el) {
          try {
            if (el.getAttribute("data-tmenu-done") === el.textContent) return;
            var k = keyFor(el.textContent || "");
            var label = friendlyLabel(k, el.textContent || "");
            if (!label) return;
            // Replace only the text: prefer deepest leaf holding the label.
            var leaf = null;
            var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
            var node;
            var best = null;
            while ((node = walker.nextNode())) {
              var v = (node.nodeValue || "").toLowerCase();
              if (k === "rename" && (v.indexOf("display name") !== -1 || v.indexOf("rename") !== -1)) best = node;
              else if (k === "test" && v.indexOf("test") !== -1) best = node;
              else if (k === "clear" && v.indexOf("clear") !== -1) best = node;
              else if (k === "mute" && v.indexOf("mute") !== -1) best = node;
              else if (k === "unsub" && v.indexOf("unsub") !== -1) best = node;
            }
            leaf = best;
            if (leaf) leaf.nodeValue = label;
            else if (!/rename|test notification|clear all|mute|unsubscribe/i.test(el.textContent || "")) return;
            else {
              // Fallback: prepend label via a span without removing children.
              var span = el.querySelector("span");
              if (span && span.textContent) {
                var tk = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, null);
                var tn = tk.nextNode();
                if (tn) tn.nodeValue = label;
                else span.textContent = label;
              }
            }
            el.setAttribute("data-tmenu-done", label);
            // Easier to scan: single-line, consistent padding.
            if (el.style) {
              el.style.whiteSpace = "nowrap";
            }
          } catch (e) { /* keep page alive */ }
        });
        // Reorganize: friendly order with destructive actions last + divider.
        try {
          var ordered = [];
          ORDER.forEach(function (k) {
            items.forEach(function (el) {
              var cur = el.textContent || "";
              // match by emoji-agnostic key
              if (keyFor(cur) === k && ordered.indexOf(el) === -1) ordered.push(el);
            });
          });
          items.forEach(function (el) {
            if (ordered.indexOf(el) === -1) ordered.push(el);
          });
          if (ordered.length === items.length && scope && scope.appendChild) {
            var alreadyOrdered = true;
            for (var i = 0; i < ordered.length; i++) {
              if (scope.children && scope.children.length) {
                // compare against current DOM order loosely
              }
            }
            ordered.forEach(function (el, idx) {
              try {
                scope.appendChild(el);
                if (el.style) {
                  // Divider before the destructive group (clear + unsubscribe).
                  var kk = keyFor(el.textContent || "");
                  if (kk === "clear") {
                    el.style.borderTop = "1px solid rgba(0,0,0,0.12)";
                    el.style.marginTop = "4px";
                    el.style.paddingTop = "8px";
                  } else if (kk === "unsub") {
                    el.style.color = "#b3261e";
                  } else {
                    el.style.borderTop = "";
                    el.style.marginTop = "";
                  }
                }
              } catch (e) { /* ignore */ }
            });
          }
        } catch (e) { /* keep page alive */ }
      });
    } catch (e) { /* never break the page */ }
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    try {
      (window.requestAnimationFrame || function (f) { return setTimeout(f, 0); })(function () {
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
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    document.addEventListener("DOMContentLoaded", apply, false);
    window.addEventListener("hashchange", schedule, false);
    window.addEventListener("popstate", schedule, false);
  } catch (e) { /* never throw */ }
})();
