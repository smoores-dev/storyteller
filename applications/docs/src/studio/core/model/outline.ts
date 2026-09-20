export type OutlineItem =
  | { type: "doc"; id: string; file: string; label: string }
  | {
      type: "category"
      label: string
      file: string | null
      items: OutlineItem[]
    }
  | { type: "link"; label: string; href: string }

export interface OutlineDoc {
  id: string
  file: string
  editFile: string | null
  title: string
  sidebar: string | null
  unlisted: boolean
}

export interface OutlineVersion {
  pluginId: string
  version: string
  label: string
  title: string
  contentPath: string
  sidebarFile: string | null
  manual: boolean
  className: string
  isLast: boolean
  sidebars: Record<string, OutlineItem[]>
  docs: OutlineDoc[]
}

export interface SidebarOutline {
  versions: OutlineVersion[]
}

export const EMPTY_OUTLINE: SidebarOutline = { versions: [] }

export function outlineFiles(outline: SidebarOutline): Set<string> {
  const files = new Set<string>()
  const walk = (items: OutlineItem[]) => {
    for (const item of items) {
      if (item.type === "doc") files.add(item.file)
      if (item.type === "category") {
        if (item.file) files.add(item.file)
        walk(item.items)
      }
    }
  }
  for (const version of outline.versions) {
    for (const items of Object.values(version.sidebars)) walk(items)
  }
  return files
}

export function versionForFile(
  outline: SidebarOutline,
  file: string | null,
): OutlineVersion | null {
  if (!file) return null
  let best: OutlineVersion | null = null
  for (const version of outline.versions) {
    if (
      file.startsWith(`${version.contentPath}/`) &&
      (best === null || version.contentPath.length > best.contentPath.length)
    ) {
      best = version
    }
  }
  return best
}
