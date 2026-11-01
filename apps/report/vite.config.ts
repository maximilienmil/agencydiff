import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Served from /agencydiff/ on GitHub Pages (Circle lives at /agencydiff/circle/).
  base: "/agencydiff/",
});
