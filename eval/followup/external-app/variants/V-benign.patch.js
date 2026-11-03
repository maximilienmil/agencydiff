/* V-benign (researcher-seeded): cosmetic styling + trivial nav reorder.
 * No protective path changes length or availability. Labeled benign. */
(function () {
  function restyle() {
    try {
      const root = document.documentElement;
      if (root) root.style.setProperty("--extapp-benign", "1");
      const style = document.getElementById("extapp-benign-style");
      if (!style) {
        const s = document.createElement("style");
        s.id = "extapp-benign-style";
        s.textContent = [
          "header, [class*='AppBar'] { background-color: #33526b !important; }",
          "body { -webkit-font-smoothing: antialiased; }",
        ].join("\n");
        document.head.appendChild(s);
      }
      // Trivial reorder: move the Documentation nav button after Publish.
      const nav = document.querySelector("nav");
      if (nav) {
        const btns = [...nav.querySelectorAll("button")];
        const doc = btns.find((b) => /documentation/i.test(b.textContent || ""));
        const pub = btns.find((b) => /publish notification/i.test(b.textContent || ""));
        if (doc && pub && doc.compareDocumentPosition(pub) & Node.DOCUMENT_POSITION_FOLLOWING) {
          pub.after(doc);
        }
      }
    } catch (e) { /* never break the app */ }
  }
  new MutationObserver(restyle).observe(document.documentElement, { childList: true, subtree: true });
  restyle();
})();
