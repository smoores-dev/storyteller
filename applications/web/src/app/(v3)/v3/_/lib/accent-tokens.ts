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
