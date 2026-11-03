/* O4 (researcher-seeded obstruction, targets D4): hides the
 * "After three hours" option from the delete-after combobox. Hidden, NOT
 * removed: removing nodes from under React corrupts reconciliation
 * (observed crash with O1); hiding is the faithful overlay emulation --
 * the option is unreachable by sight, mouse, keyboard and assistive tech. */
(function () {
  function hide() {
    try {
      const opts = document.querySelectorAll("[role='option'], option, li[data-value]");
      for (const o of opts) {
        const v = o.getAttribute("data-value") || o.getAttribute("value") || "";
        if (v === "10800" || /^\s*after three hours\s*$/i.test(o.textContent || "")) {
          o.style.display = "none";
          o.setAttribute("aria-hidden", "true");
          o.setAttribute("inert", "");
        }
      }
    } catch (e) {}
  }
  new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
  hide();
})();
