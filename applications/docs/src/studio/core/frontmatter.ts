import { parse, stringify } from "yaml"

export interface ParsedDocument {
  frontmatter: Record<string, unknown>
  body: string
  raw: string | null
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseDocument(source: string): ParsedDocument {
  const match = source.match(FRONTMATTER)
  if (!match) return { frontmatter: {}, body: source, raw: null }
  let frontmatter: Record<string, unknown> = {}
  try {
    const parsed: unknown = parse(match[1]!)
    if (parsed && typeof parsed === "object") {
      frontmatter = parsed as Record<string, unknown>
    }
  } catch {
    frontmatter = {}
  }
  return { frontmatter, body: source.slice(match[0].length), raw: match[1]! }
}

export function withFrontmatter(
  source: string,
  frontmatter: Record<string, unknown>,
): string {
  const { body } = parseDocument(source)
  const entries = Object.entries(frontmatter).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  )
  if (entries.length === 0) return body
  const yaml = stringify(Object.fromEntries(entries)).trimEnd()
  return `---\n${yaml}\n---\n\n${body.replace(/^\n+/, "")}`
}

export function titleOf(source: string, fallback: string): string {
  const { frontmatter, body } = parseDocument(source)
  if (typeof frontmatter.title === "string") return frontmatter.title
  const heading = body.match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() ?? fallback
}
