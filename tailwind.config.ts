import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── shadcn/ui palette (CSS vars in globals.css; do not change names) ──────
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },

        // ── V3 Material-3 dark-teal palette (see docs/design/design-system.md) ──
        // These are flat hex tokens used by dashboard components. They do NOT
        // override shadcn's `primary`, `background`, etc. because the names are
        // distinct (e.g. `primary-container`, `surface-container-low`).
        "surface-dim": "#0b1326",
        "surface-bright": "#31394d",
        "surface-container-lowest": "#060e20",
        "surface-container-low": "#131b2e",
        "surface-container": "#171f33",
        "surface-container-high": "#222a3d",
        "surface-container-highest": "#2d3449",
        "surface-variant": "#2d3449",
        "surface-tint": "#a1cfd1",
        "on-surface": "#dae2fd",
        "on-surface-variant": "#c0c8c8",
        "inverse-surface": "#dae2fd",
        "inverse-on-surface": "#283044",
        "outline": "#8a9292",
        "outline-variant": "#404848",
        "primary-fixed": "#bdebed",
        "primary-fixed-dim": "#a1cfd1",
        "primary-container": "#3b6769",
        "on-primary-container": "#b5e3e5",
        "on-primary-fixed": "#002021",
        "on-primary-fixed-variant": "#204d4f",
        "inverse-primary": "#396567",
        "secondary-fixed": "#dae5e5",
        "secondary-fixed-dim": "#bec8c9",
        "secondary-container": "#3e494a",
        "on-secondary-container": "#acb7b8",
        "on-secondary-fixed": "#131d1e",
        "on-secondary-fixed-variant": "#3e494a",
        "tertiary": "#ffb59f",
        "tertiary-fixed": "#ffdbd1",
        "tertiary-fixed-dim": "#ffb59f",
        "tertiary-container": "#ac3811",
        "on-tertiary": "#5f1600",
        "on-tertiary-container": "#ffd1c4",
        "on-tertiary-fixed": "#3a0a00",
        "on-tertiary-fixed-variant": "#862300",
        "error": "#ffb4ab",
        "error-container": "#93000a",
        "on-error": "#690005",
        "on-error-container": "#ffdad6",
        "on-background": "#dae2fd",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // V3 dashboard radii (additive — does not override shadcn's lg/md/sm)
        xl: "0.75rem",
      },
      spacing: {
        // V3 dashboard spacing scale per docs/design/design-system.md
        // Tailwind already has 1=4px, 2=8px, ...; these named aliases let
        // dashboard code use p-lg / gap-md to match the templates verbatim.
        base: "4px",
        xs: "8px",
        sm: "12px",
        md: "16px",
        lg: "24px",
        gutter: "24px",
        xl: "32px",
        margin: "32px",
        xxl: "48px",
      },
      fontFamily: {
        // Inter loaded in globals.css; assign to the named families.
        display: ["Inter", "system-ui", "sans-serif"],
        h1: ["Inter", "system-ui", "sans-serif"],
        h2: ["Inter", "system-ui", "sans-serif"],
        h3: ["Inter", "system-ui", "sans-serif"],
        "body-lg": ["Inter", "system-ui", "sans-serif"],
        "body-md": ["Inter", "system-ui", "sans-serif"],
        "body-sm": ["Inter", "system-ui", "sans-serif"],
        "label-md": ["Inter", "system-ui", "sans-serif"],
        "label-sm": ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Named scale for dashboards (e.g., `text-display`, `text-h1`).
        // Tailwind's built-in `text-sm`/`text-base`/`text-lg`/`text-xl` keep
        // working alongside these.
        display: [
          "48px",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        h1: [
          "32px",
          { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        h2: [
          "24px",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        h3: ["20px", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "label-md": [
          "14px",
          { lineHeight: "1", letterSpacing: "0.01em", fontWeight: "500" },
        ],
        "label-sm": [
          "12px",
          { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "600" },
        ],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
