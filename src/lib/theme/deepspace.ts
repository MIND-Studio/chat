import type { Theme } from "@mind-studio/ui";

/**
 * "Deep Space" — mind-chat's signature glassy cyan/nebula brand, preserved
 * from the pre-Mind design as an opt-in second theme alongside the default
 * Mind brand.
 *
 * It's expressed as a real `@mind-studio/ui` brand Theme so it flows through
 * the same `<ThemeProvider>` machinery as Mind/Ember/Arctic: `ThemeProvider`
 * sets `data-mind-theme="deepspace"` on <html> and injects this palette as a
 * `[data-mind-theme="deepspace"]` block. The palette below drives every
 * `@mind-studio/ui` primitive (Button, Dialog, …) AND — through the alias
 * shim in globals.css (`--cyan: var(--primary)`, `--text: var(--foreground)`,
 * `--magenta: var(--chart-5)`, …) — every bespoke `var(--cyan)` / `var(--glass)`
 * class the app already uses. So flipping to deepspace restores the original
 * cyber look without touching a single component.
 *
 * The flourishes that can't be tokens (nebula glow, scanline grid, glass
 * blur, neon focus ring) live in globals.css keyed on
 * `[data-mind-theme="deepspace"]`. Deep Space is intrinsically dark, so both
 * `light` and `dark` carry the same values — toggling light/dark while in
 * deepspace keeps the cyber look instead of bleaching it.
 */

// Deep-space cyan palette (matches the historical chat tokens in globals.css).
const surface = {
  bg0: "#05070d",
  bg1: "#0a0e17",
  bg2: "#11161f",
  glassSurface: "#141a26",
  text: "#e6edf8",
  textMuted: "#9aa4ba",
  borderSlate: "rgba(120, 160, 220, 0.16)",
  borderStrong: "rgba(120, 200, 240, 0.32)",
  cyan: "#5ce1ff",
  cyanSurface: "#0c2330",
  magenta: "#ff7be9",
  green: "#6cf0a0",
  amber: "#ffce6b",
  red: "#ff7a85",
};

const palette = {
  background: surface.bg0,
  foreground: surface.text,
  card: surface.bg1,
  "card-foreground": surface.text,
  popover: surface.bg2,
  "popover-foreground": surface.text,
  primary: surface.cyan,
  "primary-foreground": surface.bg0,
  secondary: surface.glassSurface,
  "secondary-foreground": surface.text,
  muted: surface.bg2,
  "muted-foreground": surface.textMuted,
  accent: surface.cyanSurface,
  "accent-foreground": surface.cyan,
  destructive: surface.red,
  "destructive-foreground": surface.bg0,
  border: surface.borderSlate,
  input: surface.borderStrong,
  ring: surface.cyan,
  "chart-1": surface.green,
  "chart-2": surface.cyan,
  "chart-3": "#7be9ff",
  "chart-4": surface.amber,
  "chart-5": surface.magenta,
  sidebar: surface.bg1,
  "sidebar-foreground": surface.text,
  "sidebar-primary": surface.cyan,
  "sidebar-primary-foreground": surface.bg0,
  "sidebar-accent": surface.cyanSurface,
  "sidebar-accent-foreground": surface.cyan,
  "sidebar-border": surface.borderSlate,
  "sidebar-ring": surface.cyan,
};

export const deepspace: Theme = {
  name: "deepspace",
  label: "Deep Space",
  light: palette,
  dark: palette,
  radius: "0.75rem",
  font: {
    // The pre-Mind chat ran on Inter for body and JetBrains Mono for the many
    // `// section` marks; keep both so deepspace looks exactly as it did.
    sans: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
};
