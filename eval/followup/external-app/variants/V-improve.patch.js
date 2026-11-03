/* V-improve (researcher-seeded improvement): a small floating
 * "Unsubscribe (quick)" button, attached at document.body level (never
 * inside React-managed subtrees: inserting nodes under React corrupts
 * reconciliation -- observed crash with row injection). One user tap
 * performs the same underlying unsubscribe the menu item performs. The
 * menu itself is untouched, so frozen baseline paths still replay. */
(function () {
  function currentTopic() {
    // Subscribed topic rows are div[role=button] with an aria-label of the
    // pure topic name, each containing the nested (real <button>) menu
    // trigger. Structural, not name-based: works for any topic string.
    const nav = document.querySelector("nav");
    if (!nav) return "";
    const row = [...nav.querySelectorAll('[role="button"][aria-label]')].find((b) =>
      b.querySelector("button"),
    );
    return row ? (row.getAttribute("aria-label") || "").trim() : "";
  }
  function ensureButton() {
    try {
      let btn = document.getElementById("extapp-quick-unsub");
      const topic = currentTopic();
      if (!topic) {
        if (btn) btn.style.display = "none";
        return;
      }
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "extapp-quick-unsub";
        btn.textContent = "Unsubscribe (quick)";
        btn.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99998;padding:8px 12px;cursor:pointer;";
        btn.addEventListener("click", () => {
          const tb = [...document.querySelectorAll("nav [role='button'][aria-label]")].find(
            (b) => (b.getAttribute("aria-label") || "") === topic,
          );
          if (!tb) return;
          const menuBtn = tb.querySelector("button");
          const fire = (el) => el && el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          fire(menuBtn && menuBtn !== tb ? menuBtn : tb.querySelector("button"));
          setTimeout(() => {
            const items = [...document.querySelectorAll("[role='menuitem'], li")];
            const unsub = items.find((i) => /^\s*unsubscribe\s*$/i.test(i.textContent || ""));
            if (unsub) fire(unsub);
          }, 400);
        });
        document.body.appendChild(btn);
      }
      btn.style.display = "";
      btn.setAttribute("data-topic", topic);
    } catch (e) { /* never break the app */ }
  }
  new MutationObserver(ensureButton).observe(document.documentElement, { childList: true, subtree: true });
  ensureButton();
})();
