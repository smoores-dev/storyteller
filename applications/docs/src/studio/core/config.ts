export interface StudioConfig {
  gitlab: {
    baseUrl: string
    projectPath: string
    appId: string | null
  }
  defaultBranch: string
  docsRoot: string
  contentRoots: string[]
  staticRoot: string
  externalRoots?: string[]
  editPath: string
  hourlyRequestLimit?: number
  releasePackage?: string
}

export type StudioMode = "edit" | "view"

export interface StudioLocation {
  file: string | null
  branch: string
  mode: StudioMode
  project: string | null
}

export function parseLocation(
  search: string,
  config: StudioConfig,
): StudioLocation {
  const params = new URLSearchParams(search)
  const mode = params.get("mode") === "edit" ? "edit" : "view"
  return {
    file: params.get("file"),
    branch: params.get("branch") ?? config.defaultBranch,
    mode,
    project: params.get("project"),
  }
}

export function buildLocationSearch(
  location: StudioLocation,
  config: StudioConfig,
): string {
  const params = new URLSearchParams()
  if (location.project && location.project !== config.gitlab.projectPath) {
    params.set("project", location.project)
  }
  if (location.branch !== config.defaultBranch) {
    params.set("branch", location.branch)
  }
  if (location.mode !== "view") params.set("mode", location.mode)
  if (location.file) params.set("file", location.file)
  const s = params.toString().replace(/%2F/g, "/")
  return s ? `?${s}` : ""
}

export function repoPathFor(config: StudioConfig, file: string): string {
  return joinPath(config.docsRoot, file)
}

export function isExternalFile(file: string): boolean {
  return file.startsWith("../")
}

export function fileFor(config: StudioConfig, repoPath: string): string | null {
  const prefix = `${config.docsRoot}/`
  if (repoPath.startsWith(prefix)) return repoPath.slice(prefix.length)
  const depth = config.docsRoot.split("/").filter(Boolean).length
  for (const root of config.externalRoots ?? []) {
    if (repoPath.startsWith(`${root}/`)) {
      return `${"../".repeat(depth)}${repoPath}`
    }
  }
  return null
}

export function isMarkdownFile(path: string): boolean {
  return /\.(md|mdx)$/i.test(path)
}

export function markdownFormat(path: string): "md" | "mdx" {
  return path.toLowerCase().endsWith(".mdx") ? "mdx" : "md"
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|avif)$/i

export function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path)
}

export function dirname(path: string): string {
  const index = path.lastIndexOf("/")
  return index === -1 ? "" : path.slice(0, index)
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

export function joinPath(...parts: string[]): string {
  const segments: string[] = []
  for (const part of parts) {
    for (const segment of part.split("/")) {
      if (segment === "" || segment === ".") continue
      if (segment === "..") {
        segments.pop()
        continue
      }
      segments.push(segment)
    }
  }
  return segments.join("/")
}

export function resolveAssetRepoPath(
  config: StudioConfig,
  fromFile: string,
  url: string,
): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return null
  const clean = url.split(/[?#]/)[0] ?? url
  if (clean.startsWith("/")) {
    return joinPath(config.docsRoot, config.staticRoot, clean)
  }
  return joinPath(config.docsRoot, dirname(fromFile), clean)
}

export function relativePath(fromFile: string, toFile: string): string {
  const fromParts = dirname(fromFile).split("/").filter(Boolean)
  const toParts = toFile.split("/").filter(Boolean)
  let common = 0
  while (
    common < fromParts.length &&
    common < toParts.length - 1 &&
    fromParts[common] === toParts[common]
  ) {
    common += 1
  }
  const ups = fromParts.length - common
  const rest = toParts.slice(common).join("/")
  if (ups === 0) return `./${rest}`
  return `${"../".repeat(ups)}${rest}`
}

export function resolveLinkTarget(
  fromFile: string,
  url: string,
  knownFiles: Set<string>,
): { file: string; hash: string | null } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return null
  const [rawPath = "", hash = null] = url.split("#") as [string, string?]
  if (rawPath === "") return null
  const path = rawPath.split("?")[0] ?? rawPath
  if (!isMarkdownFile(path) || path.startsWith("/")) return null
  const candidates = [
    joinPath(dirname(fromFile), path),
    joinPath(fromFile.split("/")[0] ?? "", path),
  ]
  const file =
    candidates.find((candidate) => knownFiles.has(candidate)) ?? candidates[0]!
  return { file, hash: hash ?? null }
}

const LINK_TARGET = /(!?\[[^\]]*\]\()(<?)([^)\s>]+)(>?)/g

export function rebaseRelativeLinks(
  content: string,
  fromFile: string,
  toFile: string,
): string {
  if (dirname(fromFile) === dirname(toFile)) return content
  return content.replace(
    LINK_TARGET,
    (whole, prefix: string, open: string, url: string, close: string) => {
      if (
        /^[a-z][a-z0-9+.-]*:/i.test(url) ||
        url.startsWith("//") ||
        url.startsWith("/") ||
        url.startsWith("#")
      ) {
        return whole
      }
      const match = /^([^?#]*)(.*)$/.exec(url)
      const path = match?.[1] ?? url
      const suffix = match?.[2] ?? ""
      if (path === "") return whole
      const absolute = joinPath(dirname(fromFile), path)
      return `${prefix}${open}${relativePath(toFile, absolute)}${suffix}${close}`
    },
  )
}
