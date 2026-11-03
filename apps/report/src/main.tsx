import { createRoot } from "react-dom/client";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
