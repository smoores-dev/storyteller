import GithubSlugger from "github-slugger"

export interface HeadingInfo {
  level: number
  text: string
  slug: string
  line: number
}

const CUSTOM_ID = /\s*\{#([^}]+)\}\s*$/

export function extractHeadings(source: string): HeadingInfo[] {
  const slugger = new GithubSlugger()
  const headings: HeadingInfo[] = []
  let inFence = false
  let inFrontmatter = false
  source.split("\n").forEach((raw, index) => {
    const line = raw.trimEnd()
    if (index === 0 && line === "---") {
      inFrontmatter = true
      return
    }
    if (inFrontmatter) {
      if (line === "---") inFrontmatter = false
      return
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (!match) return
    let text = match[2]!
    let slug: string
    const custom = text.match(CUSTOM_ID)
    if (custom) {
      slug = custom[1]!
      text = text.replace(CUSTOM_ID, "")
    } else {
      slug = slugger.slug(text.replace(/[*_`~[\]]/g, ""))
    }
    headings.push({ level: match[1]!.length, text, slug, line: index + 1 })
  })
  return headings
}
