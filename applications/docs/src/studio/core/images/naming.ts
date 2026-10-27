import { type StudioConfig, basename, dirname, joinPath } from "../config"

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function extensionFor(file: File): string {
  const fromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (fromName && fromName !== "") return fromName === "jpeg" ? "jpg" : fromName
  const fromMime = file.type.split("/")[1]
  if (fromMime === "jpeg") return "jpg"
  if (fromMime === "svg+xml") return "svg"
  return fromMime || "png"
}

const GENERIC_NAMES =
  /^(image|screenshot|screen shot|pasted|clipboard|untitled|img|photo)/i

export function suggestImageName(
  file: File,
  docFile: string,
  existing: Set<string>,
): string {
  const extension = extensionFor(file)
  const stem = file.name.replace(/\.[a-z0-9]+$/i, "")
  const docStem = basename(docFile).replace(/\.(md|mdx)$/i, "")
  const base =
    stem && !GENERIC_NAMES.test(stem) ? slugify(stem) : slugify(docStem)
  let candidate = `${base}.${extension}`
  let counter = 2
  while (existing.has(candidate)) {
    candidate = `${base}-${counter}.${extension}`
    counter += 1
  }
  return candidate
}

export type ImageDestinationKind = "beside" | "static" | "custom"

export interface ImageDestination {
  kind: ImageDestinationKind
  repoPath: string
  markdownUrl: string
}

export function imageDestinations(
  config: StudioConfig,
  docFile: string,
  fileName: string,
  customDir?: string,
): ImageDestination[] {
  const beside: ImageDestination = {
    kind: "beside",
    repoPath: joinPath(config.docsRoot, dirname(docFile), fileName),
    markdownUrl: `./${fileName}`,
  }
  const staticDir = joinPath(config.staticRoot, "img")
  const staticDest: ImageDestination = {
    kind: "static",
    repoPath: joinPath(config.docsRoot, staticDir, fileName),
    markdownUrl: `/img/${fileName}`,
  }
  const destinations = [beside, staticDest]
  if (customDir !== undefined) {
    destinations.push(customDestination(config, docFile, fileName, customDir))
  }
  return destinations
}

export function customDestination(
  config: StudioConfig,
  docFile: string,
  fileName: string,
  customDir: string,
): ImageDestination {
  const dir = customDir.replace(/^\/+|\/+$/g, "")
  const repoPath = joinPath(config.docsRoot, dir, fileName)
  const staticPrefix = `${config.staticRoot}/`
  if (dir === config.staticRoot || dir.startsWith(staticPrefix)) {
    const publicPath =
      dir === config.staticRoot ? "" : dir.slice(staticPrefix.length)
    return {
      kind: "custom",
      repoPath,
      markdownUrl: `/${joinPath(publicPath, fileName)}`,
    }
  }
  return {
    kind: "custom",
    repoPath,
    markdownUrl: relativeUrl(dirname(docFile), joinPath(dir, fileName)),
  }
}

export function relativeUrl(fromDir: string, toPath: string): string {
  const from = fromDir.split("/").filter(Boolean)
  const to = toPath.split("/").filter(Boolean)
  let common = 0
  while (
    common < from.length &&
    common < to.length &&
    from[common] === to[common]
  ) {
    common += 1
  }
  const up = from.slice(common).map(() => "..")
  const down = to.slice(common)
  const joined = [...up, ...down].join("/")
  return up.length === 0 ? `./${joined}` : joined
}

export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunk = 0x8000
  let binary = ""
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export async function toBlob(file: Blob): Promise<Blob> {
  return new Blob([await file.arrayBuffer()], {
    type: file.type || "image/png",
  })
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}
