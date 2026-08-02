// the css custom properties a user's accent color drives. --sidebar-accent and
// --facet-accent derive from these in globals.css, so a custom accent also
// recolors the selection washes in both shell themes.
//
// the app layout writes them as an inline style so the first paint is already
// accented, and the preferences provider rewrites them when the setting
// changes, so both sides have to agree on this list
export const ACCENT_TOKENS = [
  "--primary",
  "--sidebar-primary",
  "--facet-accent",
  "--facet-accent-foreground",
  "--sidebar-accent-foreground",
] as const

export function accentStyle(
  accentColor: string | null | undefined,
): Record<string, string> {
  if (!accentColor) return {}
  return Object.fromEntries(ACCENT_TOKENS.map((token) => [token, accentColor]))
}
