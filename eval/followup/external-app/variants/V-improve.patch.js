/* V-improve (researcher-seeded): surfaces "Unsubscribe" as a visible button
 * next to each subscribed topic row. One user tap performs the same
 * underlying unsubscribe the menu item performs. Menu itself is untouched,
 * so frozen baseline paths still replay. Labeled improvement. */
(function () {
  function ensureButtons() {
    try {
      const nav = document.querySelector("nav");
      if (!nav) return;
      const topicBtns = [...nav.querySelectorAll("button")].filter(
        (b) => /extapp-|discover-|smoke-|pilot-|trial-/.test(b.textContent || "") && b.textContent.length < 60,
      );
      for (const tb of topicBtns) {
        if (tb.parentElement && tb.parentElement.querySelector("[data-extapp-unsub]")) continue;
        const btn = document.createElement("button");
        btn.setAttribute("data-extapp-unsub", "1");
        btn.setAttribute("aria-label", "Unsubscribe (quick)");
        btn.textContent = "Unsubscribe";
        btn.style.cssText = "margin-left:8px;text-decoration:underline;cursor:pointer;";
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          // Same underlying action: open this row's menu, click Unsubscribe.
          const row = tb.closest("li, div") || tb.parentElement;
          const menuBtn = row ? row.querySelector("button:not([data-extapp-unsub])") : null;
          const fire = (el) => el && el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          if (menuBtn && menuBtn !== tb) {
            fire(menuBtn);
          } else {
            fire(tb.querySelector("button"));
          }
          setTimeout(() => {
            const items = [...document.querySelectorAll("[role='menuitem'], li[role]")];
            const unsub = items.find((i) => /^\s*unsubscribe\s*$/i.test(i.textContent || ""));
            if (unsub) fire(unsub);
          }, 400);
        });
        tb.after(btn);
      }
    } catch (e) { /* never break the app */ }
  }
  new MutationObserver(ensureButtons).observe(document.documentElement, { childList: true, subtree: true });
  ensureButtons();
})();
