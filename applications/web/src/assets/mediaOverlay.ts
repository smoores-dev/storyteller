import { type Epub, type ManifestItem } from "@storyteller-platform/epub"

export async function findMediaOverlay(
  epub: Epub,
  href: string,
): Promise<ManifestItem | null> {
  const manifest = await epub.getManifest()
  const target = decodeURI(href)

  for (const item of Object.values(manifest)) {
    if (!item.mediaOverlay) continue
    const path = await epub.resolveHref(item.href, undefined, { toRoot: true })
    if (decodeURI(path) !== target) continue
    return manifest[item.mediaOverlay] ?? null
  }

  return null
}
