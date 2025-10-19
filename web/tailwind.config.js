import defaultTheme from "tailwindcss/defaultTheme"

/** @type {import('tailwindcss').Config} */
const tailwindConfig = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  // content: [],
  theme: {
    screens: {
      sm: "$mantine-breakpoint-xs",
      md: "$mantine-breakpoint-sm",
      lg: "$mantine-breakpoint-md",
      xl: "$mantine-breakpoint-lg",
      "2xl": "$mantine-breakpoint-xl",
    },
    extend: {
      keyframes: {
        "swap-right": {
          "0%": { transform: "translateX(15%) scale(70%)", zIndex: "10" },
          "50%": { transform: "translateX(38%) scale(80%)", zIndex: "30" },
          "100%": { transform: "translateX(15%) scale(80%)", zIndex: "30" },
        },
        "swap-left": {
          "0%": { transform: "translateX(-15%) scale(70%)" },
          "50%": { transform: "translateX(-38%) scale(70%)" },
          "100%": { transform: "translateX(-15%) scale(70%)" },
        },
      },
      animation: {
        "swap-right": "swap-right 0.5s ease-in-out 0.25s both",
        "swap-left": "swap-left 0.5s ease-in-out 0.25s both",
      },
      fontFamily: {
        sans: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
        heading: ["var(--font-young-serif)"],
        literata: ["Literata"],
        "open-dyslexic": ["OpenDyslexic"],
      },
      colors: {
        "st-orange": {
          50: "var(--mantine-color-st-orange-0)",
          100: "var(--mantine-color-st-orange-1)",
          200: "var(--mantine-color-st-orange-2)",
          300: "var(--mantine-color-st-orange-3)",
          400: "var(--mantine-color-st-orange-4)",
          500: "var(--mantine-color-st-orange-5)",
          600: "var(--mantine-color-st-orange-6)",
          700: "var(--mantine-color-st-orange-7)",
          800: "var(--mantine-color-st-orange-8)",
          900: "var(--mantine-color-st-orange-9)",
        },
        reader: {
          bg: "hsl(var(--reader-ui-bg, 0 0% 100%) / <alpha-value> )",
          surface: "hsl(var(--reader-ui-surface, 0 0% 100%) / <alpha-value>)",
          "surface-hover":
            "hsl(var(--reader-ui-surface-hover, 0 0% 96.1%) / <alpha-value>)",
          border: "hsl(var(--reader-ui-border, 0 0% 89.8%) / <alpha-value>)",
          text: "hsl(var(--reader-ui-text, 0 0% 0%) / <alpha-value>)",
          "text-secondary":
            "hsl(var(--reader-ui-text-secondary, 0 0% 32.2%) / <alpha-value>)",
          "text-muted":
            "hsl(var(--reader-ui-text-muted, 0 0% 45.1%) / <alpha-value>)",
          accent:
            "hsl(var(--reader-ui-accent, 24.6 95% 53.1%) / <alpha-value>)",
          "accent-hover":
            "hsl(var(--reader-ui-accent-hover, 20.5 90.2% 48.2%) / <alpha-value>)",
          "highlight-color-yellow":
            "var(--reader-highlight-color-yellow, #ffff0088)",
          "highlight-color-red": "var(--reader-highlight-color-red, #ff000088)",
          "highlight-color-green":
            "var(--reader-highlight-color-green, #00ff0088)",
          "highlight-color-blue":
            "var(--reader-highlight-color-blue, #0000ff88)",
          "highlight-color-magenta":
            "var(--reader-highlight-color-magenta, #ff00ff88)",
          "highlight-color-custom":
            "var(--reader-highlight-color-custom, #ffffff88)",
        },
      },
    },
  },
  plugins: [],
}

export default tailwindConfig
