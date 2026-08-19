export type SidebarBuiltinGroup = "main" | "library"

export type SidebarBuiltin = {
  key: string
  group: SidebarBuiltinGroup
}

export const SIDEBAR_BUILTINS = [
  { key: "home", group: "main" },
  { key: "books", group: "main" },
  { key: "alignment-quality", group: "main" },
  { key: "series", group: "library" },
  { key: "authors", group: "library" },
  { key: "narrators", group: "library" },
  { key: "translators", group: "library" },
  { key: "tags", group: "library" },
  { key: "publication-years", group: "library" },
  { key: "ratings", group: "library" },
  { key: "statuses", group: "library" },
  { key: "formats", group: "library" },
  { key: "identifiers", group: "library" },
] as const satisfies readonly SidebarBuiltin[]

export type SidebarBuiltinKey = (typeof SIDEBAR_BUILTINS)[number]["key"]

export const SIDEBAR_BUILTIN_KEYS = new Set<string>(
  SIDEBAR_BUILTINS.map((b) => b.key),
)

export function builtinGroupFor(key: string): SidebarBuiltinGroup | null {
  return SIDEBAR_BUILTINS.find((b) => b.key === key)?.group ?? null
}
