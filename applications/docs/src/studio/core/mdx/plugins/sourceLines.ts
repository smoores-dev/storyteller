import type { Root } from "hast"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "pre",
  "blockquote",
  "table",
  "hr",
  "img",
  "details",
  "section",
  "admonition",
  "div",
])

export const SOURCE_LINE_ATTRIBUTE = "data-studio-line"
export const SOURCE_LINE_END_ATTRIBUTE = "data-studio-line-end"

export const rehypeSourceLines: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node) => {
      const position = node.position
      if (!position || !BLOCK_TAGS.has(node.tagName)) return
      node.properties[SOURCE_LINE_ATTRIBUTE] = position.start.line
      node.properties[SOURCE_LINE_END_ATTRIBUTE] = position.end.line
    })
  }
}
