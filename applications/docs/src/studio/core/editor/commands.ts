import { snippet } from "@codemirror/autocomplete"
import type { EditorView } from "@codemirror/view"

export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder: string,
) {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  const inner = selected || placeholder
  const insert = `${before}${inner}${after}`
  view.dispatch({
    changes: { from, to, insert },
    selection: {
      anchor: from + before.length,
      head: from + before.length + inner.length,
    },
  })
  view.focus()
}

export function prefixLines(
  view: EditorView,
  prefix: string | ((index: number) => string),
) {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: { from: number; insert: string }[] = []
  for (let number = startLine.number; number <= endLine.number; number++) {
    const line = view.state.doc.line(number)
    const text =
      typeof prefix === "function" ? prefix(number - startLine.number) : prefix
    changes.push({ from: line.from, insert: text })
  }
  view.dispatch({ changes })
  view.focus()
}

function blockInsertionPoint(view: EditorView) {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const needsLeadingBreak = line.text.trim() !== ""
  return {
    position: needsLeadingBreak ? line.to : line.from,
    needsLeadingBreak,
  }
}

export function insertSnippet(view: EditorView, template: string) {
  const { position, needsLeadingBreak } = blockInsertionPoint(view)
  const prefix = needsLeadingBreak ? "\n\n" : ""
  snippet(`${prefix}${template}`)(view, null, position, position)
  view.focus()
}

export function insertText(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  })
  view.focus()
}

export function ensureImports(view: EditorView, lines: string[]) {
  const doc = view.state.doc.toString()
  const missing = lines.filter((line) => !doc.includes(line))
  if (missing.length === 0) return
  let position = 0
  if (doc.startsWith("---\n")) {
    const end = doc.indexOf("\n---", 3)
    if (end !== -1) {
      const afterLine = doc.indexOf("\n", end + 1)
      position = afterLine === -1 ? doc.length : afterLine + 1
    }
  }
  const insert = `${position === 0 ? "" : "\n"}${missing.join("\n")}\n\n`
  view.dispatch({ changes: { from: position, insert } })
}

export function replaceDocument(view: EditorView, next: string) {
  const current = view.state.doc.toString()
  if (current === next) return
  const head = view.state.selection.main.head
  view.dispatch({
    changes: { from: 0, to: current.length, insert: next },
    selection: { anchor: Math.min(head, next.length) },
  })
}
