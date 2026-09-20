import { GutterMarker, gutter } from "@codemirror/view"

export interface BlameRange {
  commitId: string
  author: string
  date: string
  title: string
  startLine: number
  endLine: number
}

export interface BlameChunk {
  commit: {
    id: string
    author_name: string
    authored_date: string
    title: string
  }
  lines: string[]
}

export function blameRanges(chunks: BlameChunk[]): BlameRange[] {
  const ranges: BlameRange[] = []
  let line = 1
  for (const chunk of chunks) {
    const count = chunk.lines.length
    if (count === 0) continue
    ranges.push({
      commitId: chunk.commit.id,
      author: chunk.commit.author_name,
      date: chunk.commit.authored_date,
      title: chunk.commit.title,
      startLine: line,
      endLine: line + count - 1,
    })
    line += count
  }
  return ranges
}

function shortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
}

class BlameMarker extends GutterMarker {
  constructor(
    private readonly text: string,
    private readonly tooltip: string,
    private readonly first: boolean,
  ) {
    super()
  }

  override eq(other: BlameMarker) {
    return other.text === this.text && other.tooltip === this.tooltip
  }

  override toDOM() {
    const span = document.createElement("span")
    span.className = this.first
      ? "studio-blame studio-blame-first"
      : "studio-blame"
    span.textContent = this.text
    span.title = this.tooltip
    return span
  }
}

export function blameGutter(ranges: BlameRange[]) {
  const byLine = new Map<number, BlameRange>()
  for (const range of ranges) {
    for (let line = range.startLine; line <= range.endLine; line++) {
      byLine.set(line, range)
    }
  }
  return gutter({
    class: "studio-blame-gutter",
    lineMarker(view, line) {
      const number = view.state.doc.lineAt(line.from).number
      const range = byLine.get(number)
      if (!range) return null
      const first = number === range.startLine
      return new BlameMarker(
        first ? `${range.author} · ${shortDate(range.date)}` : "",
        `${range.title}\n${range.commitId.slice(0, 8)} · ${range.author} · ${shortDate(range.date)}`,
        first,
      )
    },
    lineMarkerChange: () => false,
    initialSpacer: () => new BlameMarker("Author name · 2026-01-01", "", true),
  })
}
