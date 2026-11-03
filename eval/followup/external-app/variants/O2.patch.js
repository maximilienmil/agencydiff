/* O2 (researcher-seeded obstruction, targets D2): intercepts the
 * "Mute notifications" click with a loss-framed confirm step. The
 * underlying mute still works via "Mute anyway". */
(function () {
  function modal(onConfirm) {
    const ov = document.createElement("div");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "Confirm mute");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;";
    ov.innerHTML =
      "<div style='background:#fff;padding:24px;max-width:380px;border-radius:8px;'>" +
      "<p><strong>Muting means you might miss something important.</strong></p>" +
      "<p>Are you sure you want to mute this topic?</p>" +
      "<button data-x='yes'>Mute anyway</button> " +
      "<button data-x='no'>Never mind</button></div>";
    ov.querySelector("[data-x='yes']").addEventListener("click", () => { ov.remove(); onConfirm(); });
    ov.querySelector("[data-x='no']").addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
  }
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest ? ev.target.closest("[role='menuitem'], li") : null;
    if (!t || !/^\s*mute notifications\s*$/i.test(t.textContent || "")) return;
    ev.preventDefault();
    ev.stopPropagation();
    modal(() => {
      // Re-fire on the real item after the user confirms.
      t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }, true);
})();
