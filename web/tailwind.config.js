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
