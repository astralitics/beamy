import type { Config } from "tailwindcss";

/**
 * Beamy — HORIZON design language.
 *
 * Colors are SEMANTIC and theme-aware: every token reads a CSS variable
 * defined in src/index.css (light `:root`, dark `:root[data-theme="dark"]`,
 * per-vertical `:root[data-vertical]`). The legacy `ink/paper/accent/
 * blueprint/safety` scales are remapped onto the same variables so the ~80
 * un-migrated screens inherit the new palette + dark mode for free during
 * rollout. Type: Fraunces (display) + Hanken Grotesk (UI) + JetBrains Mono.
 */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        hand: ['"Bricolage Grotesque"', "ui-sans-serif", "sans-serif"],
        sans: ['"Hanken Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          '"Spline Sans Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
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
        // ── semantic chassis (the going-forward system) ──
        bg: { DEFAULT: v("--bg"), subtle: v("--bg-subtle") },
        surface: { DEFAULT: v("--surface"), 2: v("--surface-2") },
        text: {
          DEFAULT: v("--text"),
          muted: v("--text-muted"),
          faint: v("--text-faint"),
        },
        border: {
          DEFAULT: v("--border"),
          subtle: v("--border-subtle"),
          strong: v("--border-strong"),
        },
        accent: {
          DEFAULT: v("--accent"),
          hover: v("--accent-hover"),
          subtle: v("--accent-subtle"),
          contrast: v("--accent-contrast"),
          // legacy numeric steps → nearest token
          50: v("--accent-subtle"),
          100: v("--accent-subtle"),
          200: v("--accent"),
          300: v("--accent"),
          400: v("--accent"),
          500: v("--accent"),
          600: v("--accent-hover"),
          700: v("--accent-hover"),
          800: v("--accent-hover"),
        },
        success: { DEFAULT: v("--success"), subtle: v("--success-subtle") },
        warn: { DEFAULT: v("--warn"), subtle: v("--warn-subtle") },
        danger: { DEFAULT: v("--danger"), subtle: v("--danger-subtle") },
        info: { DEFAULT: v("--info"), subtle: v("--info-subtle") },
        horizon: { 1: v("--horizon-1"), 2: v("--horizon-2"), 3: v("--horizon-3") },
        // the blueprint navigation rail (constant dark, vertical-tinted)
        rail: {
          DEFAULT: v("--rail-bg"),
          ink: v("--rail-ink"),
          muted: v("--rail-muted"),
          line: v("--rail-line"),
        },

        // ── back-compat: legacy scales → semantic vars ──
        paper: {
          DEFAULT: v("--bg"),
          50: v("--bg"),
          100: v("--bg-subtle"),
          200: v("--border-subtle"),
          300: v("--border"),
        },
        ink: {
          DEFAULT: v("--text"),
          50: v("--bg-subtle"),
          100: v("--border-subtle"),
          200: v("--border"),
          300: v("--border-strong"),
          400: v("--text-faint"),
          500: v("--text-muted"),
          600: v("--text-muted"),
          700: v("--text"),
          800: v("--text"),
          900: v("--text"),
          950: v("--text"),
        },
        blueprint: {
          DEFAULT: v("--text"),
          50: v("--bg-subtle"),
          100: v("--border-subtle"),
          800: v("--text"),
          900: v("--text"),
        },
        safety: {
          DEFAULT: v("--accent"),
          50: v("--accent-subtle"),
          100: v("--accent-subtle"),
          200: v("--accent"),
          300: v("--accent"),
          600: v("--accent-hover"),
          700: v("--accent-hover"),
          800: v("--accent-hover"),
        },
        // ── back-compat: raw Tailwind scales used by un-migrated pages → tokens
        // so every legacy slate/emerald/rose/amber screen inherits Beam + dark.
        slate: {
          50: v("--bg-subtle"), 100: v("--border-subtle"), 200: v("--border"),
          300: v("--border-strong"), 400: v("--text-faint"), 500: v("--text-muted"),
          600: v("--text-muted"), 700: v("--text"), 800: v("--text"), 900: v("--text"), 950: v("--text"),
        },
        emerald: { 50: v("--success-subtle"), 100: v("--success-subtle"), 600: v("--success"), 700: v("--success"), 800: v("--success") },
        rose: { 50: v("--danger-subtle"), 100: v("--danger-subtle"), 600: v("--danger"), 700: v("--danger"), 800: v("--danger") },
        amber: { 50: v("--warn-subtle"), 100: v("--warn-subtle"), 600: v("--warn"), 700: v("--warn"), 800: v("--warn") },
      },
      borderColor: {
        DEFAULT: v("--border"),
      },
      letterSpacing: {
        tightest: "-0.025em",
        tight: "-0.015em",
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        md: "12px",
        lg: "14px",
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        // map to vars so they vanish in dark automatically
        soft: "var(--shadow-sm)",
        lift: "var(--shadow)",
        pop: "var(--shadow-lg)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "band-wipe": {
          "0%": { clipPath: "inset(0 100% 0 0)" },
          "100%": { clipPath: "inset(0 0 0 0)" },
        },
      },
      animation: {
        rise: "rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        fade: "fade 0.25s ease both",
        "band-wipe": "band-wipe 0.55s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
