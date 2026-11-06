import { type NewSeriesRelation } from "@/database/series"
import { type UUID } from "@/uuid"

export type SeriesEntry = {
  bookUuid: UUID
  // Looked up from the book when not provided, e.g. for bulk-selected books
  title?: string
  // When the book was added to the library; orders books sharing a number.
  // Missing for bulk-selected books, which sort first.
  createdAt?: string
  position: number | null
  featured: boolean
}

// Each box is a series number; dropping a book into a box gives it that
// number. Gaps and shared numbers (e.g. two editions) are just empty and
// multi-book boxes, so a drag never renumbers any book but the dragged one.
export type Box =
  | {
      kind: "number"
      position: number
      entries: SeriesEntry[]
      // Past the highest used number; only shown while dragging, never saved
      trailing: boolean
      canRemove: boolean
      // Set on the first revealed box of a run long enough to collapse
      collapseRun: { start: number; end: number } | null
    }
  | { kind: "collapsed"; start: number; end: number }
  | { kind: "unnumbered"; entries: SeriesEntry[] }

// Runs of empty boxes longer than this collapse into a single row
const MAX_VISIBLE_EMPTY_RUN = 3

// Expanding a collapsed row reveals this many boxes from its start, so even a
// huge gap (e.g. 1–1998 before a book numbered by year) only adds a few boxes
// per click
export const EXPAND_STEP = 10

// Far beyond any real series number, and small enough that whole numbers
// stay exact through `shift`
const MAX_SERIES_NUMBER = 1e9

export function isValidSeriesNumber(value: number) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_SERIES_NUMBER
}

// Matches SQLite's `collate nocase`, which only folds ASCII letters, so books
// sharing a number are ordered the same way here as in the library
function foldCase(title: string) {
  return title.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

function compare(first: string, second: string) {
  if (first === second) return 0
  return first < second ? -1 : 1
}

// Orders the books within a box: oldest added first, then by title for books
// added in the same second (e.g. a bulk import). Timestamps are
// "YYYY-MM-DD HH:MM:SS", so they sort as text.
function byBoxOrder(a: SeriesEntry, b: SeriesEntry) {
  return (
    compare(a.createdAt ?? "", b.createdAt ?? "") ||
    compare(foldCase(a.title ?? ""), foldCase(b.title ?? ""))
  )
}

// Avoids float drift (e.g. 2.1 + 1) when shifting decimal positions
export function shift(position: number, by: number) {
  return Math.round((position + by) * 1e6) / 1e6
}

function highestPosition(entries: SeriesEntry[]) {
  const positions = entries.flatMap((entry) =>
    entry.position === null ? [] : [entry.position],
  )
  return positions.length ? Math.max(...positions) : 0
}

export function lastUsedNumber(entries: SeriesEntry[]) {
  return Math.floor(highestPosition(entries))
}

// The number a newly added book should get to land after the others
export function nextSeriesNumber(entries: SeriesEntry[]) {
  return lastUsedNumber(entries) + 1
}

export function toSeriesRelations(entries: SeriesEntry[]): NewSeriesRelation[] {
  return entries.map(({ bookUuid, position, featured }) => ({
    bookUuid,
    position,
    featured,
  }))
}

// Whether one expansion shows a whole collapsed row, counting a leftover
// short enough to show as boxes anyway
export function expandsFully(start: number, end: number) {
  return end - start + 1 <= EXPAND_STEP + MAX_VISIBLE_EMPTY_RUN
}

// Reveals the next few numbers of a collapsed row
export function expandRun(expanded: Set<number>, start: number, end: number) {
  const next = new Set(expanded)
  const last = Math.min(start + EXPAND_STEP - 1, end)
  for (let n = start; n <= last; n++) next.add(n)
  return next
}

// Hides every revealed number in a run, without visiting each number in it
export function collapseRun(expanded: Set<number>, start: number, end: number) {
  return new Set([...expanded].filter((n) => n < start || n > end))
}

export function buildBoxes(
  entries: SeriesEntry[],
  trailingCount: number,
  expandedNumbers: Set<number>,
): Box[] {
  const byPosition = new Map<number, SeriesEntry[]>()
  const unnumbered: SeriesEntry[] = []
  for (const entry of entries) {
    if (entry.position === null) {
      unnumbered.push(entry)
    } else {
      byPosition.set(entry.position, [
        ...(byPosition.get(entry.position) ?? []),
        entry,
      ])
    }
  }

  const positions = [...byPosition.keys()].sort((a, b) => a - b)
  const highest = highestPosition(entries)
  const last = lastUsedNumber(entries)
  // Start at 1 unless a book already uses 0 or a negative number
  const first = Math.min(1, ...positions.map(Math.floor))

  const isEmpty = (position: number) => !byPosition.has(position)
  // Removing box N shifts everything after it up one, so a decimal just
  // after N could land on a decimal just before it; disallow that case.
  // Scanning every position for each box makes this quadratic in the number
  // of books; a lookup of nearby numbers would help if very long series ever
  // feel slow.
  const canRemove = (position: number) =>
    isEmpty(position) &&
    !positions.some(
      (p) => p !== position && p > position - 1 && p < position + 1,
    )

  const numberBox = (position: number): Extract<Box, { kind: "number" }> => {
    const trailing = position > highest
    return {
      kind: "number",
      position,
      entries: (byPosition.get(position) ?? []).sort(byBoxOrder),
      trailing,
      canRemove: !trailing && canRemove(position),
      collapseRun: null,
    }
  }

  const boxes: Box[] = []

  // Adds a box for each number from start to end, or one collapsed row if
  // there are too many
  const addHidden = (start: number, end: number) => {
    if (end - start + 1 > MAX_VISIBLE_EMPTY_RUN) {
      boxes.push({ kind: "collapsed", start, end })
      return
    }
    for (let n = start; n <= end; n++) boxes.push(numberBox(n))
  }

  // Adds an empty box for each whole number from start to end, collapsing
  // long stretches the user hasn't revealed. Only revealed numbers are
  // visited, so even a huge run stays cheap.
  const addEmptyRun = (start: number, end: number) => {
    if (end - start + 1 <= MAX_VISIBLE_EMPTY_RUN) {
      addHidden(start, end)
      return
    }
    const revealed = [...expandedNumbers]
      .filter((n) => n >= start && n <= end)
      .sort((a, b) => a - b)
    let next = start
    for (const n of revealed) {
      addHidden(next, n - 1)
      boxes.push({
        ...numberBox(n),
        collapseRun: n === revealed[0] ? { start, end } : null,
      })
      next = n + 1
    }
    addHidden(next, end)
  }

  let nextWhole = first
  for (const position of positions) {
    addEmptyRun(nextWhole, Math.ceil(position) - 1)
    boxes.push(numberBox(position))
    nextWhole = Math.max(nextWhole, Math.floor(position) + 1)
  }
  for (let i = 1; i <= trailingCount; i++) boxes.push(numberBox(last + i))

  // Always shown, and first: at the bottom it would be pushed away by the
  // trailing boxes that appear while dragging toward it. Being always present
  // also avoids shifting the list when a drag starts.
  return [
    { kind: "unnumbered", entries: unnumbered.sort(byBoxOrder) },
    ...boxes,
  ]
}
