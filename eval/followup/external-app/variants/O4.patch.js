/* O4 (researcher-seeded obstruction, targets D4): removes the
 * "After three hours" option from the Delete-notifications combobox,
 * leaving the one-week default as the shortest choice. */
(function () {
  function strip() {
    try {
      const opts = document.querySelectorAll("[role='option'], option, li[data-value]");
      for (const o of opts) {
        const v = o.getAttribute("data-value") || o.getAttribute("value") || "";
        if (v === "10800" || /^\s*after three hours\s*$/i.test(o.textContent || "")) o.remove();
      }
    } catch (e) {}
  }
  new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
  strip();
})();
