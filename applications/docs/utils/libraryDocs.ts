import fs from "node:fs"
import path from "node:path"

import GitHubSlugger from "github-slugger"

const LIBRARIES_DIR = path.resolve(__dirname, "../../../libraries")
const OUTPUT_DIR = path.resolve(__dirname, "../generated/libraries")
const STUB = "readme-stub.md"
const API_HEADING = /^## API Docs\s*$/m

export interface LibraryDocsOptions {
  routeBasePath: string
  repoUrl: string
  branch: string
}

export interface GeneratedLibrary {
  name: string
  source: string
  hasApi: boolean
}

/**
 * Library READMEs are generated: readme-stub.md (hand written) followed by the
 * typedoc output. The docs site shows the two halves as separate pages so the
 * generated reference does not drown the prose, and the studio edits the stub
 * (or the README itself for libraries without a stub) through studio_source.
 */
export function headingSlugs(markdown: string): string[] {
  const slugger = new GitHubSlugger()
  const slugs: string[] = []
  let inFence = false
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) continue
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue
    const raw = match[1]!
    const custom = /\{#([^}]+)\}\s*$/.exec(raw)
    const text = raw
      .replace(/\{#[^}]+\}\s*$/, "")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/[*_]/g, "")
    slugs.push(custom ? custom[1]! : slugger.slug(text))
  }
  return slugs
}

function titleOf(markdown: string): string | null {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown)
  return match ? match[1]!.replace(/`/g, "").trim() : null
}

export function split(readme: string, stub: string | null) {
  if (stub !== null) {
    const trimmedStub = stub.replace(/\s+$/, "")
    if (readme.startsWith(trimmedStub)) {
      return { overview: stub, api: readme.slice(trimmedStub.length) }
    }
  }
  const match = API_HEADING.exec(readme)
  if (!match) return { overview: readme, api: "" }
  return {
    overview: readme.slice(0, match.index),
    api: readme.slice(match.index),
  }
}

const LINK_URL = /(!?\[[^\]]*\]\()([^)\s]+)(\))/g

function isRelativeFile(url: string) {
  return !(
    url.startsWith("#") ||
    url.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(url) ||
    url.startsWith("//")
  )
}

export function rewriteOverviewLinks(
  overview: string,
  apiSlugs: string[],
  apiRoute: string,
  sourceUrl: (relative: string, image: boolean) => string,
): string {
  const own = new Set(headingSlugs(overview))
  const api = new Set(apiSlugs)
  return overview.replace(
    LINK_URL,
    (whole, open: string, url: string, close) => {
      if (url.startsWith("#")) {
        const slug = url.slice(1)
        if (own.has(slug)) return whole
        if (slug === "api-docs") return `${open}${apiRoute}${close}`
        if (api.has(slug)) return `${open}${apiRoute}#${slug}${close}`
        return whole
      }
      if (isRelativeFile(url)) {
        return `${open}${sourceUrl(url, open.startsWith("!"))}${close}`
      }
      return whole
    },
  )
}

export function rewriteApiLinks(
  api: string,
  sourceUrl: (relative: string, image: boolean) => string,
): string {
  return api.replace(LINK_URL, (whole, open: string, url: string, close) => {
    const sibling = /^(?:\.\.\/)?#([^#)]*)(?:#([^)]+))?$/.exec(url)
    if (sibling) return `${open}#${sibling[2] ?? sibling[1]}${close}`
    if (isRelativeFile(url)) {
      return `${open}${sourceUrl(url, open.startsWith("!"))}${close}`
    }
    return whole
  })
}

function frontMatter(fields: Record<string, unknown>) {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  return `---\n${lines.join("\n")}\n---\n\n`
}

export function generateLibraryDocs(
  options: LibraryDocsOptions,
): GeneratedLibrary[] {
  if (!fs.existsSync(LIBRARIES_DIR)) return []
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const result: GeneratedLibrary[] = []
  for (const entry of fs.readdirSync(LIBRARIES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(LIBRARIES_DIR, entry.name)
    const readmePath = path.join(dir, "README.md")
    if (!fs.existsSync(readmePath)) continue
    const stubPath = path.join(dir, STUB)
    const hasStub = fs.existsSync(stubPath)
    const readme = fs.readFileSync(readmePath, "utf8")
    const stub = hasStub ? fs.readFileSync(stubPath, "utf8") : null
    const { overview, api } = split(readme, stub)
    const sourceFile = hasStub ? STUB : "README.md"
    const source = `../../libraries/${entry.name}/${sourceFile}`
    const title = titleOf(overview) ?? entry.name
    const apiBody = api.replace(API_HEADING, "").replace(/^\s+/, "")
    const hasApi = apiBody.trim().length > 0
    const apiRoute = `/${options.routeBasePath}/${entry.name}/api`
    const sourceUrl = (relative: string, image: boolean) =>
      `${options.repoUrl}/-/${image ? "raw" : "blob"}/${options.branch}/libraries/${entry.name}/${relative.replace(/^\.\//, "")}`
    const out = path.join(OUTPUT_DIR, entry.name)
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(
      path.join(out, "index.md"),
      frontMatter({
        slug: `/${entry.name}`,
        sidebar_label: entry.name,
        custom_edit_url: `/edit?file=${source}`,
        studio_source: source,
        pagination_next: hasApi ? `${entry.name}/api` : null,
      }) +
        rewriteOverviewLinks(
          overview,
          hasApi ? headingSlugs(apiBody) : [],
          apiRoute,
          sourceUrl,
        ),
    )
    if (hasApi) {
      fs.writeFileSync(
        path.join(out, "api.md"),
        frontMatter({
          title: `${title} API`,
          sidebar_label: "API reference",
          slug: `/${entry.name}/api`,
          custom_edit_url: null,
          toc_max_heading_level: 4,
          pagination_prev: `${entry.name}/index`,
        }) + rewriteApiLinks(apiBody, sourceUrl),
      )
    }
    fs.writeFileSync(
      path.join(out, "_category_.json"),
      `${JSON.stringify(
        {
          label: entry.name,
          collapsed: true,
          link: { type: "doc", id: `${entry.name}/index` },
        },
        null,
        2,
      )}\n`,
    )
    result.push({ name: entry.name, source, hasApi })
  }
  return result
}
