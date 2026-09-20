import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippet,
} from "@codemirror/autocomplete"

import { ensureImports } from "./commands"
import type { SnippetAction, StudioSnippet } from "./snippets"

function matches(query: string, snippetItem: StudioSnippet) {
  if (!query) return true
  const haystacks = [snippetItem.label, ...(snippetItem.keywords ?? [])].map(
    (value) => value.toLowerCase(),
  )
  return haystacks.some((value) => {
    let index = 0
    for (const char of query) {
      index = value.indexOf(char, index)
      if (index === -1) return false
      index += 1
    }
    return true
  })
}

export function slashCompletion(
  getSnippets: () => StudioSnippet[],
  onAction: (action: SnippetAction) => void,
) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\/[\w-]*$/)
    if (!match) return null
    const lineStart = context.state.doc.lineAt(match.from).from
    const before =
      match.from === lineStart
        ? ""
        : context.state.sliceDoc(match.from - 1, match.from)
    if (before !== "" && !/\s/.test(before)) return null
    const query = match.text.slice(1).toLowerCase()
    const options: Completion[] = getSnippets()
      .filter((item) => matches(query, item))
      .map((item) => ({
        label: item.label,
        detail: item.detail,
        type: item.action ? "function" : "keyword",
        apply: (view, _completion, from, to) => {
          if (item.action) {
            view.dispatch({ changes: { from, to, insert: "" } })
            onAction(item.action)
            return
          }
          snippet(item.template ?? "")(view, null, from, to)
          if (item.imports) ensureImports(view, item.imports)
        },
      }))
    if (options.length === 0) return null
    return { from: match.from, options, filter: false }
  }
}
