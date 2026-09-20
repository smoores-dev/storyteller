import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete"

import { isMarkdownFile, relativePath, resolveLinkTarget } from "../config"

import { extractHeadings } from "./headings"

export interface LinkContext {
  file: string
  files: string[]
  loadFile: (file: string) => Promise<string | null>
}

export function linkCompletion(getContext: () => LinkContext | null) {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const linkContext = getContext()
    if (!linkContext) return null
    const match = context.matchBefore(/\]\([^)\s]*$/)
    if (!match) return null
    const typed = match.text.slice(2)
    const hashIndex = typed.indexOf("#")
    if (hashIndex === -1) {
      const pages: Completion[] = linkContext.files
        .filter((file) => isMarkdownFile(file) && file !== linkContext.file)
        .map((file) => ({
          label: relativePath(linkContext.file, file),
          detail: file,
          type: "text",
        }))
      const sections: Completion[] = extractHeadings(
        context.state.doc.toString(),
      ).map((heading) => ({
        label: `#${heading.slug}`,
        detail: heading.text,
        type: "property",
      }))
      return {
        from: match.from + 2,
        options: [...sections, ...pages],
        validFor: /^[^)\s#]*$/,
      }
    }
    const path = typed.slice(0, hashIndex)
    let source: string | null
    if (path === "") {
      source = context.state.doc.toString()
    } else {
      const target = resolveLinkTarget(
        linkContext.file,
        path,
        new Set(linkContext.files),
      )
      source = target ? await linkContext.loadFile(target.file) : null
    }
    if (!source) return null
    return {
      from: match.from + 2 + hashIndex + 1,
      options: extractHeadings(source).map((heading) => ({
        label: heading.slug,
        detail: heading.text,
        type: "property",
      })),
      validFor: /^[^)\s]*$/,
    }
  }
}
