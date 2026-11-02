import { continueRender, delayRender, registerRoot } from "remotion";
import "../../design/tokens.css";
import { Root } from "./Root.js";

// Hold the first frame until the self-hosted Inter faces are ready, so no
// frame renders in a fallback font.
if (typeof document !== "undefined") {
  const handle = delayRender("Loading Inter");
  Promise.all([
    document.fonts.load('400 20px "Inter"'),
    document.fonts.load('800 20px "Inter"'),
  ])
    .then(() => document.fonts.ready)
    .finally(() => continueRender(handle));
}

registerRoot(Root);
