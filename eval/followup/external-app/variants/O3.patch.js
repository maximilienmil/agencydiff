/* O3 (researcher-seeded obstruction, targets D3): intercepts
 * "Clear all notifications" with a type-the-topic-name confirmation.
 * Typing the exact name completes the same underlying clear. */
(function () {
  let pendingTopic = "";
  function modal(topic, onConfirm) {
    const ov = document.createElement("div");
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
    input.addEventListener("input", () => { yes.disabled = input.value.trim() !== topic; });
    yes.addEventListener("click", () => { ov.remove(); onConfirm(); });
    ov.querySelector("[data-x='no']").addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
    setTimeout(() => input.focus(), 50);
  }
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest ? ev.target.closest("[role='menuitem'], li") : null;
    if (!t || !/^\s*clear all notifications\s*$/i.test(t.textContent || "")) return;
    ev.preventDefault();
    ev.stopPropagation();
    pendingTopic = (document.querySelector("h1, h2, [class*='title']") || {}).textContent || "";
    // Topic name is the subscribed row label; fall back to nav button text.
    const navBtn = [...document.querySelectorAll("nav button")].find((b) => /extapp-|discover-|smoke-|trial-/.test(b.textContent || ""));
    if (navBtn) pendingTopic = (navBtn.textContent || "").trim();
    modal(pendingTopic, () => {
      t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }, true);
})();
