import { continueRender, delayRender, registerRoot } from "remotion";
import "../../design/tokens.css";
import { Root } from "./Root.js";

// Hold the first frame until the self-hosted faces are ready, so no
// frame renders in a fallback font.
if (typeof document !== "undefined") {
  const handle = delayRender("Loading Inter");
  Promise.all([
    document.fonts.load('400 20px "Redaction"'),
    document.fonts.load('italic 400 20px "Redaction"'),
    document.fonts.load('400 20px "Redaction 35"'),
    document.fonts.load('400 20px "Atkinson Hyperlegible Next"'),
    document.fonts.load('700 20px "Atkinson Hyperlegible Next"'),
    document.fonts.load('400 20px "Martian Mono"'),
  ])
    .then(() => document.fonts.ready)
    .finally(() => continueRender(handle));
}

registerRoot(Root);
