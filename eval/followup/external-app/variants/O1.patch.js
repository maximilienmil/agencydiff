/* O1 (researcher-seeded obstruction, targets D1): hides the
 * "Unsubscribe" item from the topic menu. Hidden (display:none + inert),
 * NOT removed: removing nodes from under React corrupts its child list
 * and crashes the app (observed), while a source-level removal would
 * re-render cleanly. Hiding keeps the item unreachable by sight, mouse,
 * keyboard and assistive tech -- the faithful overlay emulation. */
(function () {
  function hide() {
    try {
      const items = document.querySelectorAll("[role='menuitem'], [role='menu'] li, ul[role] li");
      for (const i of items) {
        if (/^\s*unsubscribe\s*$/i.test(i.textContent || "")) {
          i.style.display = "none";
          i.setAttribute("aria-hidden", "true");
          i.setAttribute("inert", "");
        }
      }
    } catch (e) {}
  }
  new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
  hide();
})();
