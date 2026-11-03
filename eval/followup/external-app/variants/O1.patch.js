/* O1 (researcher-seeded obstruction, targets D1): removes the
 * "Unsubscribe" item from the topic menu whenever it appears. */
(function () {
  function strip() {
    try {
      const items = document.querySelectorAll("[role='menuitem'], [role='menu'] li, ul[role] li");
      for (const i of items) {
        if (/^\s*unsubscribe\s*$/i.test(i.textContent || "")) i.remove();
      }
    } catch (e) {}
  }
  new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
  strip();
})();
