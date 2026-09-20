import { type Diagnostic, linter } from "@codemirror/lint"

import {
  type StudioConfig,
  isExternalFile,
  joinPath,
  resolveAssetRepoPath,
  resolveLinkTarget,
} from "../config"

export { forceLinting } from "@codemirror/lint"

export interface CompileProblem {
  message: string
  line: number | null
}

export interface LintNote {
  line: number
  message: string
}

export interface LintContext {
  file: string
  format: "md" | "mdx"
  config: StudioConfig
  knownFiles: Set<string>
  existingRepoPaths: Set<string>
  compileFailure: CompileProblem | null
  notes?: LintNote[]
  manualSidebar?: boolean
}

const LINK = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const JSX_TAG = /<([A-Z][A-Za-z0-9]*)(?=[\s/>])/
const ESM_LINE = /^\s*(import|export)\s/

function blankCode(text: string) {
  return text.replace(/`[^`]*`/g, (span) => " ".repeat(span.length))
}

export function studioLinter(getContext: () => LintContext | null) {
  return linter(
    (view) => {
      const context = getContext()
      if (!context) return []
      const diagnostics: Diagnostic[] = []
      const doc = view.state.doc
      const listedPrefixes = [
        ...context.config.contentRoots,
        joinPath(context.config.staticRoot, "img"),
      ].map((root) => `${joinPath(context.config.docsRoot, root)}/`)
      let inFence = false
      let inFrontmatter = false
      let warnedJsx = false
      let warnedEsm = false
      for (let number = 1; number <= doc.lines; number++) {
        const line = doc.line(number)
        const text = line.text
        if (number === 1 && text.trim() === "---") {
          inFrontmatter = true
          continue
        }
        if (inFrontmatter) {
          if (text.trim() === "---") inFrontmatter = false
          else if (
            context.manualSidebar &&
            /^sidebar_position\s*:/.test(text)
          ) {
            diagnostics.push({
              from: line.from,
              to: line.to,
              severity: "warning",
              message:
                "sidebar_position has no effect here: this section uses an explicit sidebars file. Drag the page into place in the Sidebar view instead.",
            })
          }
          continue
        }
        if (/^\s*(```|~~~)/.test(text)) {
          inFence = !inFence
          continue
        }
        if (inFence) continue
        const plain = blankCode(text)
        if (context.format === "md") {
          const esm = plain.match(ESM_LINE)
          if (esm && !warnedEsm) {
            warnedEsm = true
            diagnostics.push({
              from: line.from,
              to: line.to,
              severity: "warning",
              message:
                "Imports and exports only work in .mdx files. In a .md file this line is shown as text. Rename the file to .mdx to use them.",
            })
          }
          const jsx = plain.match(JSX_TAG)
          if (jsx && !warnedJsx) {
            warnedJsx = true
            const start = line.from + (jsx.index ?? 0)
            diagnostics.push({
              from: start,
              to: start + jsx[0].length + 1,
              severity: "warning",
              message: `<${jsx[1]}> is a React component. Components only work in .mdx files, in a .md file this renders as plain HTML. Rename the file to .mdx to use it.`,
            })
          }
        }
        for (const match of plain.matchAll(LINK)) {
          const url = match[2]!
          const start = line.from + (match.index ?? 0)
          const end = start + match[0].length
          if (match[1] === "!") {
            const repoPath = resolveAssetRepoPath(
              context.config,
              context.file,
              url,
            )
            if (
              repoPath &&
              listedPrefixes.some((prefix) => repoPath.startsWith(prefix)) &&
              !context.existingRepoPaths.has(repoPath)
            ) {
              diagnostics.push({
                from: start,
                to: end,
                severity: "warning",
                message: `Image not found: ${url}`,
              })
            }
            continue
          }
          if (isExternalFile(context.file)) continue
          const target = resolveLinkTarget(
            context.file,
            url,
            context.knownFiles,
          )
          if (target && !context.knownFiles.has(target.file)) {
            diagnostics.push({
              from: start,
              to: end,
              severity: "error",
              message: `Linked page not found: ${target.file}`,
            })
          }
        }
      }
      if (context.compileFailure) {
        const number = Math.min(
          Math.max(context.compileFailure.line ?? 1, 1),
          doc.lines,
        )
        const line = doc.line(number)
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: "error",
          message: context.compileFailure.message,
        })
      }
      for (const note of context.notes ?? []) {
        if (note.line < 1 || note.line > doc.lines) continue
        const line = doc.line(note.line)
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: "info",
          message: note.message,
        })
      }
      return diagnostics
    },
    { delay: 400 },
  )
}
