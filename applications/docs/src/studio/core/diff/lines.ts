import { diffLines } from "diff"

export interface DiffRow {
  kind: "context" | "added" | "removed"
  text: string
  oldLine: number | null
  newLine: number | null
}

export interface LineRange {
  start: number
  end: number
}

export interface LineDiff {
  rows: DiffRow[]
  added: number
  removed: number
  changedOld: LineRange[]
  changedNew: LineRange[]
}

function splitLines(value: string): string[] {
  const lines = value.split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  return lines
}

export function computeLineDiff(before: string, after: string): LineDiff {
  const rows: DiffRow[] = []
  const changedOld: LineRange[] = []
  const changedNew: LineRange[] = []
  let oldLine = 1
  let newLine = 1
  let added = 0
  let removed = 0
  for (const part of diffLines(before, after)) {
    const lines = splitLines(part.value)
    if (part.added) {
      changedNew.push({ start: newLine, end: newLine + lines.length - 1 })
      for (const text of lines) {
        rows.push({ kind: "added", text, oldLine: null, newLine })
        newLine += 1
        added += 1
      }
    } else if (part.removed) {
      changedOld.push({ start: oldLine, end: oldLine + lines.length - 1 })
      for (const text of lines) {
        rows.push({ kind: "removed", text, oldLine, newLine: null })
        oldLine += 1
        removed += 1
      }
    } else {
      for (const text of lines) {
        rows.push({ kind: "context", text, oldLine, newLine })
        oldLine += 1
        newLine += 1
      }
    }
  }
  return { rows, added, removed, changedOld, changedNew }
}

export function collapseContext(
  rows: DiffRow[],
  context = 3,
): (DiffRow | { kind: "skip"; count: number })[] {
  const keep = new Array<boolean>(rows.length).fill(false)
  rows.forEach((row, index) => {
    if (row.kind === "context") return
    for (
      let i = Math.max(0, index - context);
      i <= Math.min(rows.length - 1, index + context);
      i++
    ) {
      keep[i] = true
    }
  })
  const result: (DiffRow | { kind: "skip"; count: number })[] = []
  let skipped = 0
  rows.forEach((row, index) => {
    if (keep[index]) {
      if (skipped > 0) result.push({ kind: "skip", count: skipped })
      skipped = 0
      result.push(row)
    } else {
      skipped += 1
    }
  })
  if (skipped > 0) result.push({ kind: "skip", count: skipped })
  return result
}

export function lineInRanges(
  line: number,
  endLine: number,
  ranges: LineRange[],
): boolean {
  return ranges.some((range) => range.start <= endLine && range.end >= line)
}
