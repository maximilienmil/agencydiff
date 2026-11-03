/* O3 (researcher-seeded obstruction, targets D3): intercepts
 * "Clear all notifications" with a type-the-topic-name confirmation.
 * Typing the exact name completes the same underlying clear. */
(function () {
  let pendingTopic = "";
  function modal(topic, onConfirm) {
    const ov = document.createElement("div");
    // Click-away-proof: the menu underneath holds the subscription the
    // re-fired clear reads from React state. A real modal traps outside
    // interaction; without this, MUI sees the modal clicks as click-away,
    // closes the menu, clears that state, and the re-fired clear no-ops.
    // stopPropagation only (no preventDefault: the input needs focus).
    for (const ev of ["mousedown", "touchstart", "focusin"]) {
      ov.addEventListener(ev, (e) => e.stopPropagation(), true);
    }
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "Confirm clear");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;";
    ov.innerHTML =
      "<div style='background:#fff;padding:24px;max-width:420px;border-radius:8px;'>" +
      "<p>Clearing deletes all stored notifications for <strong></strong>. This cannot be undone.</p>" +
      "<p>Type the topic name to confirm:</p>" +
      "<input aria-label='Topic name confirmation' style='width:100%;padding:8px;' />" +
      "<p><button data-x='yes' disabled>Clear everything</button> <button data-x='no'>Keep notifications</button></p></div>";
    ov.querySelector("strong").textContent = topic;
    const input = ov.querySelector("input");
    const yes = ov.querySelector("[data-x='yes']");
    // The overlay reads the topic from nav text, which can carry an
    // unread-count prefix the user never types. Accept any non-empty
    // input the stored name ends with (the pure topic name always does).
    input.addEventListener("input", () => {
      const v = input.value.trim();
      yes.disabled = !(v.length > 0 && topic.endsWith(v));
    });
    yes.addEventListener("click", () => { ov.remove(); onConfirm(); });
    ov.querySelector("[data-x='no']").addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
    setTimeout(() => input.focus(), 50);
  }
  // Suppression flag: the re-fired click must not re-trigger this listener.
  let refiring = false;
  document.addEventListener("click", (ev) => {
    if (refiring) return;
    const t = ev.target.closest ? ev.target.closest("[role='menuitem'], li") : null;
    if (!t || !/^\s*clear all notifications\s*$/i.test(t.textContent || "")) return;
    ev.preventDefault();
    ev.stopPropagation();
    // The open menu belongs to the displayed topic: the SPA route is the
    // pure topic name (nav text carries unread/muted badges the user never
    // types). GitHub-style: the modal shows the expected name.
    try {
      pendingTopic = decodeURIComponent(
        (window.location.pathname || "").replace(/^\//, "").split("/")[0] || "",
      );
    } catch (e) {
      pendingTopic = "";
    }
    if (!pendingTopic) {
      const navBtn = [...document.querySelectorAll("nav button")].find((b) =>
        /^\s*\d*\s*\S/.test(b.textContent || ""),
      );
      if (navBtn) pendingTopic = (navBtn.textContent || "").trim();
    }
    modal(pendingTopic, () => {
      refiring = true;
      try {
        t.click();
      } finally {
        setTimeout(() => { refiring = false; }, 0);
      }
    });
  }, true);
})();
