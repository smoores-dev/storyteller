import { type AudioRange, type SentenceRange } from "./getSentenceRanges.ts"
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

type Clip = { owner: number; clip: AudioRange }

export function collapseRanges(
  ranges: SentenceRange[],
  audiofiles: string[],
  durations: Record<string, number>,
  behaviour: RangeBehaviour,
): { ranges: SentenceRange[]; holes: Hole[] } {
  const gap = behaviour.gapSeconds
  const holes: Hole[] = []
  const out: AudioRange[][] = ranges.map((range) =>
    range.audioRanges.map((clip) => ({ ...clip })),
  )

  const flow: number[] = []
  for (const [i, range] of ranges.entries()) {
    if (!(behaviour.dropUnread && range.state === "dropped")) flow.push(i)
  }
  const clips: Clip[] = flow.flatMap((owner) =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    out[owner]!.map((clip) => ({ owner, clip })),
  )

  const duration = (file: string) => durations[file] ?? 0
  const isHole = (seconds: number) => gap !== null && seconds > gap

  for (const [c, { owner, clip }] of clips.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const range = ranges[owner]!
    const prev = clips[c - 1] ?? null
    const next = clips[c + 1] ?? null
    const prevRange =
      prev && prev.owner !== owner ? (ranges[prev.owner] ?? null) : null
    const nextRange =
      next && next.owner !== owner ? (ranges[next.owner] ?? null) : null
    const sameSentenceBefore = prev !== null && prev.owner === owner
    const sameSentenceAfter = next !== null && next.owner === owner

    if (!prev || prev.clip.audiofile !== clip.audiofile) {
      if (!sameSentenceBefore && isHole(clip.start)) {
        holes.push({
          audiofile: clip.audiofile,
          start: 0,
          end: clip.start,
          anchor: anchorBefore(range),
          boundary: !prevRange || prevRange.chapterId !== range.chapterId,
          between: between(prevRange, range),
        })
      } else {
        clip.start = 0
      }
    }

    if (!next || next.clip.audiofile !== clip.audiofile) {
      const end = duration(clip.audiofile)
      if (!sameSentenceAfter && isHole(end - clip.end)) {
        holes.push({
          audiofile: clip.audiofile,
          start: clip.end,
          end,
          anchor: anchorAfter(range),
          boundary: !nextRange || nextRange.chapterId !== range.chapterId,
          between: between(range, nextRange),
        })
      } else {
        clip.end = end
      }
    } else if (!sameSentenceAfter && isHole(next.clip.start - clip.end)) {
      holes.push({
        audiofile: clip.audiofile,
        start: clip.end,
        end: next.clip.start,
        anchor: anchorAfter(range),
        boundary: nextRange !== null && nextRange.chapterId !== range.chapterId,
        between: between(range, nextRange),
      })
    } else {
      clip.end = next.clip.start
    }
  }

  if (behaviour.dropUnread) placeDropped(out, ranges, flow, holes)

  const referenced = new Set(ranges.flatMap((range) => range.audiofiles))
  const flowRanges = flow.map((i) => ranges[i]).filter((r) => r !== undefined)
  for (const [index, audiofile] of audiofiles.entries()) {
    if (referenced.has(audiofile) || duration(audiofile) <= 0) continue
    if (gap === null) continue
    const before = audiofiles.slice(0, index)
    const prev =
      flowRanges.findLast((r) => before.includes(r.last.audiofile)) ?? null
    const next = prev
      ? (flowRanges[flowRanges.indexOf(prev) + 1] ?? null)
      : (flowRanges[0] ?? null)
    const anchor = prev ? anchorAfter(prev) : next ? anchorBefore(next) : null
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

  return {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ranges: ranges.map((range, i) => range.withAudioRanges(out[i]!)),
    holes: sortHoles(holes, audiofiles),
  }
}

function placeDropped(
  out: AudioRange[][],
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
    const prevIndex = flow.findLast((f) => f < i)
    const nextIndex = flow.find((f) => f > j - 1)
    const prevClip = prevIndex === undefined ? null : out[prevIndex]?.at(-1)
    const nextClip = nextIndex === undefined ? null : out[nextIndex]?.[0]
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const file = ranges[i]!.first.audiofile
    const host =
      nextClip && nextClip.audiofile === file
        ? { file, end: nextClip.start, shrink: null }
        : prevClip && prevClip.audiofile === file
          ? { file, end: prevClip.end, shrink: prevClip }
          : null
    if (host) {
      const width = (j - i) * DROPPED_WIDTH
      if (host.shrink)
        host.shrink.end = Math.max(host.shrink.start, host.end - width)
      else if (prevClip && prevClip.audiofile === file) {
        prevClip.end = Math.max(
          prevClip.start,
          Math.min(prevClip.end, host.end - width),
        )
      }
      for (const hole of holes) {
        if (hole.audiofile === host.file && hole.end === host.end) {
          hole.end = Math.max(hole.start, host.end - width)
        }
      }
      let cursor = host.end - width
      for (let k = i; k < j; k++) {
        out[k] = [
          { audiofile: host.file, start: cursor, end: cursor + DROPPED_WIDTH },
        ]
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
