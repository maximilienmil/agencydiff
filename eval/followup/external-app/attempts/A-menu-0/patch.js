(function () {
  "use strict";

  var LABELS = [
    { keys: ["send test notification"], label: "\uD83D\uDC8C Send a test message" },
    { keys: ["change display name"], label: "\u270F\uFE0F Rename this topic" },
    { keys: ["unmute notifications"], label: "\uD83D\uDD14 Resume notifications" },
    { keys: ["mute notifications"], label: "\uD83D\uDD15 Pause notifications" },
    { keys: ["clear all notifications"], label: "\uD83E\uDDF9 Clear all messages" },
    { keys: ["unsubscribe"], label: "\uD83D\uDC4B Leave this topic" }
  ];

  function matchLabel(text) {
    var t = (text || "").toLowerCase().replace(/\s+/g, " ").trim();
    for (var i = 0; i < LABELS.length; i++) {
      for (var k = 0; k < LABELS[i].keys.length; k++) {
        if (t.indexOf(LABELS[i].keys[k]) !== -1) return LABELS[i].label;
      }
    }
    return null;
  }

  function orderOf(text) {
    var t = (text || "").toLowerCase();
    if (t.indexOf("send test") !== -1) return 0;
    if (t.indexOf("display name") !== -1) return 1;
    if (t.indexOf("mute") !== -1 || t.indexOf("unmute") !== -1 || t.indexOf("pause") !== -1 || t.indexOf("resume") !== -1) return 2;
    if (t.indexOf("clear all") !== -1) return 3;
    if (t.indexOf("unsubscribe") !== -1 || t.indexOf("leave this topic") !== -1) return 4;
    return 9;
  }

  function relabelItem(item, newLabel) {
    try {
      if (item.getAttribute("data-tmenu-done") === newLabel) return;
      var walker = document.createTreeWalker(item, window.NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      var n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.trim() !== "") nodes.push(n);
      }
      if (nodes.length === 0) return;
      nodes[0].nodeValue = " " + newLabel;
      for (var i = 1; i < nodes.length; i++) nodes[i].nodeValue = "";
      item.setAttribute("data-tmenu-done", newLabel);
      item.setAttribute("title", newLabel.trim());
    } catch (e) { /* ignore */ }
  }

  function applyOnce() {
    try {
      var candidates = document.querySelectorAll('li, [role="menuitem"], [role="menuitemcheckbox"], [role="option"]');
      var groups = {};
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var txt = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!txt) continue;
        var mapped = matchLabel(txt);
        if (!mapped) continue;
        relabelItem(el, mapped);
        var parent = el.parentElement;
        if (parent) {
          var pid = parent.getAttribute("data-tmenu-group");
          if (!pid) {
            pid = "g" + Math.random().toString(36).slice(2);
            parent.setAttribute("data-tmenu-group", pid);
          }
          (groups[pid] = groups[pid] || { parent: parent, items: [] }).items.push(el);
        }
      }
      Object.keys(groups).forEach(function (pid) {
        try {
          var g = groups[pid];
          var items = g.items.slice().sort(function (a, b) {
            return orderOf(a.textContent) - orderOf(b.textContent);
          });
          var first = items[0];
          var inOrder = true;
          for (var j = 0; j < items.length; j++) {
            if (g.parent.children[j] !== items[j]) { inOrder = false; break; }
          }
          if (!inOrder && first) {
            for (var k = items.length - 1; k >= 0; k--) {
              g.parent.insertBefore(items[k], g.parent.firstChild);
            }
          }
          if (!g.parent.querySelector('[data-tmenu-header="1"]') && items.length >= 4) {
            var header = document.createElement("li");
            header.setAttribute("data-tmenu-header", "1");
            header.setAttribute("aria-hidden", "true");
            header.textContent = "What would you like to do?";
            header.style.cssText = "font-size:12px;opacity:.65;padding:8px 16px 4px;list-style:none;pointer-events:none;";
            g.parent.insertBefore(header, g.parent.firstChild);
          }
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }

  try {
    applyOnce();
    var obs = new MutationObserver(function () { applyOnce(); });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (e) { /* never break the page */ }
})();
