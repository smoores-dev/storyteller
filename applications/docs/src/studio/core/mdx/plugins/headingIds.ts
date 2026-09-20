import GithubSlugger from "github-slugger"
import type { Heading, Root } from "mdast"
import { toString } from "mdast-util-to-string"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"

const CUSTOM_ID = /\s*\{#([^}]+)\}\s*$/

export const remarkHeadingIds: Plugin<[], Root> = () => {
  return (tree) => {
    const slugger = new GithubSlugger()
    visit(tree, "heading", (node: Heading) => {
      const last = node.children[node.children.length - 1]
      let id: string | null = null
      if (last?.type === "text") {
        const match = last.value.match(CUSTOM_ID)
        if (match) {
          id = match[1]!
          last.value = last.value.replace(CUSTOM_ID, "")
        }
      }
      const data = (node.data ??= {}) as {
        hProperties?: Record<string, unknown>
      }
      const properties = (data.hProperties ??= {})
      if (typeof properties.id === "string") return
      properties.id = id ?? slugger.slug(toString(node))
    })
  }
}
