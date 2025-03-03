// TODO: light and dark are identical,
// they should be collapsed
export const highlightTints = {
  light: {
    yellow: "rgba(255, 255, 0, 0.3)",
    red: "rgba(255, 0, 0, 0.3)",
    green: "rgba(0, 255, 0, 0.3)",
    blue: "rgba(0, 0, 255, 0.3)",
    magenta: "rgba(255, 0, 255, 0.3)",
  },
  dark: {
    yellow: "rgba(255, 255, 0, 0.3)",
    red: "rgba(255, 0, 0, 0.3)",
    green: "rgba(0, 255, 0, 0.3)",
    blue: "rgba(0, 0, 255, 0.3)",
    magenta: "rgba(255, 0, 255, 0.3)",
  },
} as const

export const highlightUnderlines = {
  light: {
    yellow: "rgba(255, 255, 0, 0.5)",
    red: "rgba(255, 0, 0, 0.5)",
    green: "rgba(0, 255, 0, 0.5)",
    blue: "rgba(0, 0, 255, 0.5)",
    magenta: "rgba(255, 0, 255, 0.5)",
  },
  dark: {
    yellow: "rgba(255, 255, 0, 0.5)",
    red: "rgba(255, 0, 0, 0.5)",
    green: "rgba(0, 255, 0, 0.5)",
    blue: "rgba(0, 0, 255, 0.5)",
    magenta: "rgba(255, 0, 255, 0.5)",
  },
} as const

export type HighlightTint = keyof (typeof highlightTints)["light"]
