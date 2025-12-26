const { hairlineWidth } = require("nativewind/theme")

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.tsx", "./components/**/*.tsx"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        youngserif: ["YoungSerif"],
      },
      colors: {
        border: "hsla(var(--border))",
        input: "hsla(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        link: "hsl(var(--link))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      borderWidth: {
        hairline: hairlineWidth(),
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
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [
    require("tailwindcss-animate"),
    ({ addBase }) =>
      addBase({
        ":root": {
          "--background": "0 0% 100%",
          "--foreground": "0 0% 3.9%",
          "--card": "0 0% 100%",
          "--card-foreground": "0 0% 3.9%",
          "--popover": "0 0% 100%",
          "--popover-foreground": "0 0% 3.9%",
          "--primary": "22 85% 39%",
          "--primary-foreground": "0 0% 98%",
          "--secondary": "0 0% 96.1%",
          "--secondary-foreground": "0 0% 9%",
          "--muted": "0 0% 96.1%",
          "--muted-foreground": "0 0% 45.1%",
          "--accent": "0 0% 96.1%",
          "--accent-foreground": "0 0% 9%",
          "--link": "209, 77%, 43%",
          "--destructive": "0 84.2% 60.2%",
          "--border": "0 0% 89.8%",
          "--input": "0 0% 89.8%",
          "--ring": "0 0% 63%",
          "--radius": "0.625rem",
          "--chart-1": "12 76% 61%",
          "--chart-2": "173 58% 39%",
          "--chart-3": "197 37% 24%",
          "--chart-4": "43 74% 66%",
          "--chart-5": "27 87% 67%",
        },
      }),
  ],
}
