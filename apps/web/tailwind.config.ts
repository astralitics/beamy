import type { Config } from "tailwindcss";

/**
 * Beamy — editorial architectural refinement.
 *
 * Type: Fraunces (serif display, also for big numerics) + Hanken Grotesk
 * (clean grotesk for body and UI). Single warm accent (terracotta).
 *
 * Tokens are intentionally restrained — the design comes from proportions,
 * type, and whitespace, not from color or chrome.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        sans: ['"Hanken Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // Custom scale — slightly larger and more confident.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px
        xs: ["0.75rem", { lineHeight: "1.125rem" }], // 12 / 18
        sm: ["0.875rem", { lineHeight: "1.375rem" }], // 14 / 22
        base: ["0.9375rem", { lineHeight: "1.5rem" }], // 15 / 24
        lg: ["1.0625rem", { lineHeight: "1.625rem" }], // 17 / 26
        xl: ["1.25rem", { lineHeight: "1.75rem" }], // 20 / 28
        "2xl": ["1.5rem", { lineHeight: "2rem" }], // 24 / 32
        "3xl": ["1.875rem", { lineHeight: "2.375rem" }], // 30 / 38
        "4xl": ["2.375rem", { lineHeight: "2.75rem" }], // 38 / 44
        "5xl": ["3rem", { lineHeight: "3.25rem" }], // 48 / 52
        "6xl": ["3.75rem", { lineHeight: "1" }], // 60
      },
      colors: {
        // Warm-neutral surfaces — slightly off-white, not clinical.
        paper: {
          DEFAULT: "#FAFAF7",
          50: "#FAFAF7",
          100: "#F4F3EE",
          200: "#E6E4DC",
          300: "#D2CFC4",
        },
        // Ink — high-contrast text and primary buttons.
        ink: {
          DEFAULT: "#18181B",
          50: "#FAFAFA",
          100: "#F4F4F5",
          200: "#E4E4E7",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#09090B",
        },
        // Legacy "blueprint" → mapped to ink so existing classes still work.
        blueprint: {
          DEFAULT: "#18181B",
          50: "#FAFAFA",
          100: "#F4F4F5",
          800: "#27272A",
          900: "#09090B",
        },
        // Accent: warm terracotta. Used SPARINGLY — focal accents, key totals,
        // and the in-progress phase dot. Never for entire backgrounds.
        accent: {
          DEFAULT: "#A14A1F",
          50: "#FBF1EB",
          100: "#F5DECC",
          200: "#EBBE9F",
          300: "#DC9869",
          400: "#C97540",
          500: "#A14A1F",
          600: "#853A14",
          700: "#6B2E0F",
          800: "#502209",
        },
        // Legacy "safety" → mapped to accent for back-compat.
        safety: {
          DEFAULT: "#A14A1F",
          50: "#FBF1EB",
          100: "#F5DECC",
          200: "#EBBE9F",
          300: "#DC9869",
          600: "#853A14",
          700: "#6B2E0F",
          800: "#502209",
        },
      },
      letterSpacing: {
        tightest: "-0.025em",
        tight: "-0.015em",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(24,24,27,0.04), 0 1px 3px rgba(24,24,27,0.06)",
        lift: "0 4px 12px rgba(24,24,27,0.06), 0 1px 3px rgba(24,24,27,0.05)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 0.35s cubic-bezier(0.2, 0.7, 0.2, 1) both",
        fade: "fade 0.25s ease both",
      },
    },
  },
  plugins: [],
} satisfies Config;
