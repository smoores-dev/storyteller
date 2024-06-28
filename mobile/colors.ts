export const highlightTints = {
  light: {
    yellow: "rgba(255, 255, 0, 0.3)",
    red: "rgba(255, 0, 0, 0.3)",
    green: "rgba(0, 255, 0, 0.3)",
    blue: "rgba(0, 0, 255, 0.3)",
    magenta: "rgba(255, 0, 255, 0.3)",
  },
  dark: {
    yellow: "rgba(255, 255, 0, 0.7)",
    red: "rgba(255, 0, 0, 0.7)",
    green: "rgba(0, 255, 0, 0.7)",
    blue: "rgba(0, 0, 255, 0.7)",
    magenta: "rgba(255, 0, 255, 0.7)",
  },
} as const

export type HighlightTint = keyof (typeof highlightTints)["light"]
