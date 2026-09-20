import type { Root } from "hast"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"

export interface StudioUrlsOptions {
  resolveAsset: (url: string) => string | null
  resolveLink: (url: string) => string | null
}

interface JsxAttribute {
  type: string
  name?: string
  value?: unknown
}

interface JsxElement {
  type: "mdxJsxFlowElement" | "mdxJsxTextElement"
  name: string | null
  attributes: JsxAttribute[]
}

function rewriteJsxAttribute(
  element: JsxElement,
  attribute: string,
  resolve: (url: string) => string | null,
) {
  for (const attr of element.attributes) {
    if (attr.type !== "mdxJsxAttribute" || attr.name !== attribute) continue
    if (typeof attr.value !== "string") continue
    const next = resolve(attr.value)
    if (next) attr.value = next
  }
}

export const rehypeStudioUrls: Plugin<[StudioUrlsOptions], Root> = (
  options,
) => {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type === "element") {
        const properties = node.properties
        if (node.tagName === "img" && typeof properties.src === "string") {
          const next = options.resolveAsset(properties.src)
          if (next) properties.src = next
        }
        if (node.tagName === "a" && typeof properties.href === "string") {
          const next = options.resolveLink(properties.href)
          if (next) properties.href = next
        }
        return
      }
      const type = (node as { type: string }).type
      if (type === "mdxJsxFlowElement" || type === "mdxJsxTextElement") {
        const element = node as unknown as JsxElement
        if (element.name === "img") {
          rewriteJsxAttribute(element, "src", options.resolveAsset)
        }
        if (element.name === "a") {
          rewriteJsxAttribute(element, "href", options.resolveLink)
        }
      }
    })
  }
}
