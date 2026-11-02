import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

// Astryx (Meta's design system) supplies the components; this theme maps
// them onto design/tokens.css: Meta blue as the one accent, Atkinson
// Hyperlegible Next for UI text, Redaction for headings, Martian Mono for code.
export const agencyTheme = defineTheme({
  name: "agencydiff",
  extends: neutralTheme,
  tokens: {
    "--font-family-body": '"Atkinson Hyperlegible Next", ui-sans-serif, system-ui, sans-serif',
    "--font-family-heading": '"Redaction", Georgia, serif',
    "--font-family-code": '"Martian Mono", ui-monospace, Menlo, monospace',
    "--color-accent": ["#0866FF", "#4C8DFF"],
    "--color-text-accent": ["#0064E0", "#6A9FFF"],
    "--color-icon-accent": ["#0064E0", "#6A9FFF"],
    "--color-text-primary": ["#1C2B33", "#E4E6EB"],
    "--color-text-secondary": ["#465A66", "#AEB9C1"],
    "--color-background-body": ["#FFFFFF", "#0B0F14"],
    "--color-background-surface": ["#FFFFFF", "#111820"],
    "--color-background-card": ["#FFFFFF", "#111820"],
  },
});
