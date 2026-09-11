import { type SentenceRange } from "./getSentenceRanges.ts"
import { slotKey } from "./interpolateSentenceRanges.ts"

export type RangeBehaviour = {
  gapSeconds: number | null
  audioChapterSeconds: number | null
  dropUnread: boolean
}

export const LEGACY_RANGE_BEHAVIOUR: RangeBehaviour = {
  gapSeconds: null,
  audioChapterSeconds: null,
  dropUnread: false,
}

export function rangeBehaviour(options: {
  gapSeconds?: number | null | undefined
  audioChapterSeconds?: number | null | undefined
  dropUnread?: boolean | null | undefined
}): RangeBehaviour {
  const positive = (value: number | null | undefined) =>
    value !== null && value !== undefined && value > 0 ? value : null
  return {
    gapSeconds: positive(options.gapSeconds),
    audioChapterSeconds: positive(options.audioChapterSeconds),
    dropUnread: options.dropUnread ?? false,
  }
}

export type HoleAnchor = {
  chapterId: string
  sentenceId: number
  position: "before" | "after"
}

export type Hole = {
  audiofile: string
  start: number
  end: number
  anchor: HoleAnchor
  boundary: boolean
  between: string
}

export type AudioChapter = {
  anchor: HoleAnchor
  holes: Hole[]
  title: string | null
}

const DROPPED_WIDTH = 0.001

function anchorAfter(range: SentenceRange): HoleAnchor {
  return {
    chapterId: range.chapterId,
    sentenceId: range.id,
    position: "after",
  }
}

function anchorBefore(range: SentenceRange): HoleAnchor {
  return {
    chapterId: range.chapterId,
    sentenceId: range.id,
    position: "before",
  }
}

function between(prev: SentenceRange | null, next: SentenceRange | null) {
  return `${prev ? slotKey(prev) : ""}|${next ? slotKey(next) : ""}`
}

export function collapseRanges(
  ranges: SentenceRange[],
  audiofiles: string[],
  durations: Record<string, number>,
  behaviour: RangeBehaviour,
): { ranges: SentenceRange[]; holes: Hole[] } {
  const gap = behaviour.gapSeconds
  const holes: Hole[] = []
  const out: SentenceRange[] = ranges.map((range) => ({ ...range }))

  const flow: number[] = []
  for (const [i, range] of ranges.entries()) {
    if (!(behaviour.dropUnread && range.state === "dropped")) flow.push(i)
  }

  const duration = (file: string) => durations[file] ?? 0
  const isHole = (seconds: number) => gap !== null && seconds > gap

  for (const [f, i] of flow.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const range = out[i]!
    const prevIndex = flow[f - 1]
    const nextIndex = flow[f + 1]
    const prev = prevIndex === undefined ? null : ranges[prevIndex] ?? null
    const next = nextIndex === undefined ? null : ranges[nextIndex] ?? null

    if (!prev || prev.audiofile !== range.audiofile) {
      if (isHole(range.start)) {
        holes.push({
          audiofile: range.audiofile,
          start: 0,
          end: range.start,
          anchor: anchorBefore(range),
          boundary: !prev || prev.chapterId !== range.chapterId,
          between: between(prev, range),
        })
      } else {
        range.start = 0
      }
    }

    if (!next || next.audiofile !== range.audiofile) {
      const end = duration(range.audiofile)
      if (isHole(end - range.end)) {
        holes.push({
          audiofile: range.audiofile,
          start: range.end,
          end,
          anchor: anchorAfter(range),
          boundary: !next || next.chapterId !== range.chapterId,
          between: between(range, next),
        })
      } else {
        range.end = end
      }
    } else if (isHole(next.start - range.end)) {
      holes.push({
        audiofile: range.audiofile,
        start: range.end,
        end: next.start,
        anchor: anchorAfter(range),
        boundary: next.chapterId !== range.chapterId,
        between: between(range, next),
      })
    } else {
      range.end = next.start
    }
  }

  if (behaviour.dropUnread) placeDropped(out, ranges, flow, holes)

  const referenced = new Set(ranges.map((range) => range.audiofile))
  const flowRanges = flow.map((i) => ranges[i]).filter((r) => r !== undefined)
  for (const [index, audiofile] of audiofiles.entries()) {
    if (referenced.has(audiofile) || duration(audiofile) <= 0) continue
    if (gap === null) continue
    const before = audiofiles.slice(0, index)
    const prev = flowRanges.findLast((r) => before.includes(r.audiofile)) ?? null
    const next = prev
      ? (flowRanges[flowRanges.indexOf(prev) + 1] ?? null)
      : (flowRanges[0] ?? null)
    const anchor = prev
      ? anchorAfter(prev)
      : next
        ? anchorBefore(next)
        : null
    if (!anchor) continue
    holes.push({
      audiofile,
      start: 0,
      end: duration(audiofile),
      anchor,
      boundary: true,
      between: between(prev, next),
    })
  }

  return { ranges: out, holes: sortHoles(holes, audiofiles) }
}

function placeDropped(
  out: SentenceRange[],
  ranges: SentenceRange[],
  flow: number[],
  holes: Hole[],
) {
  const flowSet = new Set(flow)
  let i = 0
  while (i < out.length) {
    if (flowSet.has(i)) {
      i++
      continue
    }
    let j = i
    while (j < out.length && !flowSet.has(j)) j++
    const cluster = out.slice(i, j)
    const prevIndex = flow.findLast((f) => f < i)
    const nextIndex = flow.find((f) => f > j - 1)
    const prev = prevIndex === undefined ? null : out[prevIndex] ?? null
    const next = nextIndex === undefined ? null : out[nextIndex] ?? null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const file = ranges[i]!.audiofile
    const host =
      next && next.audiofile === file
        ? { file, end: next.start, shrink: null }
        : prev && prev.audiofile === file
          ? { file, end: prev.end, shrink: prev }
          : null
    if (host) {
      const width = cluster.length * DROPPED_WIDTH
      if (host.shrink) host.shrink.end = Math.max(host.shrink.start, host.end - width)
      else if (prev && prev.audiofile === file) {
        prev.end = Math.max(prev.start, Math.min(prev.end, host.end - width))
      }
      for (const hole of holes) {
        if (hole.audiofile === host.file && hole.end === host.end) {
          hole.end = Math.max(hole.start, host.end - width)
        }
      }
      let cursor = host.end - width
      for (const range of cluster) {
        range.audiofile = host.file
        range.start = cursor
        range.end = cursor + DROPPED_WIDTH
        cursor += DROPPED_WIDTH
      }
    }
    i = j
  }
}

function sortHoles(holes: Hole[], audiofiles: string[]): Hole[] {
  const order = new Map(audiofiles.map((file, i) => [file, i]))
  return holes.toSorted(
    (a, b) =>
      (order.get(a.audiofile) ?? 0) - (order.get(b.audiofile) ?? 0) ||
      a.start - b.start,
  )
}

export function holeSeconds(holes: Hole[]): number {
  return holes.reduce((sum, hole) => sum + (hole.end - hole.start), 0)
}

export function planAudioChapters(
  holes: Hole[],
  behaviour: RangeBehaviour,
  durations: Record<string, number>,
  trackTitle: (audiofile: string) => string | null,
): { chapters: AudioChapter[]; remaining: Hole[] } {
  const threshold = behaviour.audioChapterSeconds
  if (threshold === null) return { chapters: [], remaining: holes }

  const groups = new Map<string, Hole[]>()
  const remaining: Hole[] = []
  for (const hole of holes) {
    if (!hole.boundary) {
      remaining.push(hole)
      continue
    }
    const list = groups.get(hole.between) ?? []
    list.push(hole)
    groups.set(hole.between, list)
  }

  const chapters: AudioChapter[] = []
  for (const group of groups.values()) {
    if (holeSeconds(group) < threshold) {
      remaining.push(...group)
      continue
    }
    const title =
      group
        .filter((hole) => {
          const duration = durations[hole.audiofile] ?? 0
          return duration > 0 && (hole.end - hole.start) / duration >= 0.5
        })
        .map((hole) => trackTitle(hole.audiofile))
        .find((candidate) => candidate !== null) ?? null
    chapters.push({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      anchor: group[0]!.anchor,
      holes: group,
      title,
    })
  }

  return { chapters, remaining }
}
