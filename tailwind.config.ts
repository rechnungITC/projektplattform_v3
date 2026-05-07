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

        // ── V3 Material-3 dark-teal palette (PROJ-51-β) ─────────────────────
        // All bound to CSS variables in globals.css. Tenants can re-tone via
        // `<style data-tenant-brand>` injection (see lib/branding/server.ts).
        "surface-dim": "hsl(var(--surface))",
        surface: "hsl(var(--surface))",
        "surface-bright": "hsl(var(--surface-bright))",
        "surface-container-lowest": "hsl(var(--surface-container-lowest))",
        "surface-container-low": "hsl(var(--surface-container-low))",
        "surface-container": "hsl(var(--surface-container))",
        "surface-container-high": "hsl(var(--surface-container-high))",
        "surface-container-highest": "hsl(var(--surface-container-highest))",
        "surface-variant": "hsl(var(--surface-variant))",
        "surface-tint": "hsl(var(--surface-tint))",
        "on-surface": "hsl(var(--on-surface))",
        "on-surface-variant": "hsl(var(--on-surface-variant))",
        "inverse-surface": "hsl(var(--inverse-surface))",
        "inverse-on-surface": "hsl(var(--inverse-on-surface))",
        outline: "hsl(var(--outline))",
        "outline-variant": "hsl(var(--outline-variant))",
        "primary-fixed": "hsl(var(--primary-fixed))",
        "primary-fixed-dim": "hsl(var(--primary-fixed-dim))",
        "primary-container": "hsl(var(--primary-container))",
        "on-primary-container": "hsl(var(--on-primary-container))",
        "on-primary-fixed": "hsl(var(--on-primary-fixed))",
        "on-primary-fixed-variant": "hsl(var(--on-primary-fixed-variant))",
        "inverse-primary": "hsl(var(--inverse-primary))",
        "secondary-fixed": "hsl(var(--secondary-fixed))",
        "secondary-fixed-dim": "hsl(var(--secondary-fixed-dim))",
        "secondary-container": "hsl(var(--secondary-container))",
        "on-secondary-container": "hsl(var(--on-secondary-container))",
        "on-secondary-fixed": "hsl(var(--on-secondary-fixed))",
        "on-secondary-fixed-variant": "hsl(var(--on-secondary-fixed-variant))",
        tertiary: "hsl(var(--tertiary))",
        "tertiary-fixed": "hsl(var(--tertiary-fixed))",
        "tertiary-fixed-dim": "hsl(var(--tertiary-fixed-dim))",
        "tertiary-container": "hsl(var(--tertiary-container))",
        "on-tertiary": "hsl(var(--on-tertiary))",
        "on-tertiary-container": "hsl(var(--on-tertiary-container))",
        "on-tertiary-fixed": "hsl(var(--on-tertiary-fixed))",
        "on-tertiary-fixed-variant": "hsl(var(--on-tertiary-fixed-variant))",
        error: "hsl(var(--destructive))",
        "error-container": "hsl(var(--error-container))",
        "on-error": "hsl(var(--destructive-foreground))",
        "on-error-container": "hsl(var(--on-error-container))",
        "on-background": "hsl(var(--foreground))",

        // Brand layer (overrideable per tenant)
        "brand-accent": "hsl(var(--brand-accent))",
        "brand-accent-foreground": "hsl(var(--brand-accent-foreground))",
        "brand-nav-active": "hsl(var(--brand-nav-active))",

        // Semantic Risk + Status (PROJ-51-γ) — used as
        // `bg-risk-low/10 text-risk-low border-risk-low/20` for badges.
        "risk-low": "hsl(var(--risk-low))",
        "risk-medium": "hsl(var(--risk-medium))",
        "risk-high": "hsl(var(--risk-high))",
        "risk-critical": "hsl(var(--risk-critical))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
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
