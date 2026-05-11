import type { Config } from "tailwindcss";

/**
 * Beamy palette. Very subtle construction theme:
 *   - `paper` — warm off-white (drafting paper feel). Body bg.
 *   - `blueprint` — deep navy used for headings + primary text accents.
 *   - `safety` — the one true construction-zone amber. Used sparingly,
 *     mostly for the milestone badge + the active route indicator.
 *
 * The bulk of the UI still uses Tailwind's `slate` (cool gray) for body
 * text because slate is the dominant readability color. Paper bg + slate
 * text is the working pairing.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        paper: {
          DEFAULT: "#FAF8F4",
          50: "#FCFAF7",
          100: "#F5F2EB",
          200: "#EBE6DB",
        },
        blueprint: {
          DEFAULT: "#1E293B",
          50: "#F8FAFC",
          100: "#EEF2F7",
          800: "#1E293B",
          900: "#0F172A",
        },
        safety: {
          DEFAULT: "#D97706",
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          700: "#B45309",
          800: "#92400E",
        },
      },
      backgroundImage: {
        // Very faint grid — printed-blueprint reference. 32px grid, 4% black.
        "blueprint-grid":
          "linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-32": "32px 32px",
      },
    },
  },
  plugins: [],
} satisfies Config;
