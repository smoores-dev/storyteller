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
      },
    },
  },
  plugins: [],
}

export default tailwindConfig
