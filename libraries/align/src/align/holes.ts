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

export const DEFAULT_RANGE_BEHAVIOUR: RangeBehaviour = {
  gapSeconds: 5,
  audioChapterSeconds: 300,
  dropUnread: false,
}

export function rangeBehaviour(options: {
  gapSeconds?: number | null | undefined
  audioChapterSeconds?: number | null | undefined
  dropUnread?: boolean | null | undefined
}): RangeBehaviour {
  const threshold = (
    value: number | null | undefined,
    fallback: number | null,
  ) => {
    if (value === null || value === undefined) return fallback
    return value > 0 ? value : null
  }
  return {
    gapSeconds: threshold(
      options.gapSeconds,
      DEFAULT_RANGE_BEHAVIOUR.gapSeconds,
    ),
    audioChapterSeconds: threshold(
      options.audioChapterSeconds,
      DEFAULT_RANGE_BEHAVIOUR.audioChapterSeconds,
    ),
    dropUnread: options.dropUnread ?? DEFAULT_RANGE_BEHAVIOUR.dropUnread,
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

export type ExistingChapter = {
  id: string
  title: string | null
}

export type AudioChapter = {
  anchor: HoleAnchor
  holes: Hole[]
  title: string | null
  anchorTitle: string | null
  existing: ExistingChapter | null
}

export type SpineEntryLike = {
  index: number
  chapterId: string
  title: string | null
  status: string
}

export function audioChapterSpine(pending: Iterable<SpineEntryLike>): {
  chapterTitle: (chapterId: string) => string | null
  excludedBetween: (
    prev: string | null,
    next: string | null,
  ) => ExistingChapter[]
} {
  const items = [...pending].toSorted((a, b) => a.index - b.index)
  const indices = new Map(items.map((item) => [item.chapterId, item.index]))
  const titles = new Map(items.map((item) => [item.chapterId, item.title]))
  return {
    chapterTitle: (chapterId) => titles.get(chapterId) ?? null,
    excludedBetween: (prev, next) => {
      const from = prev === null ? -Infinity : indices.get(prev)
      const to = next === null ? Infinity : indices.get(next)
      if (from === undefined || to === undefined) return []
      return items
        .filter(
          (item) =>
            item.status === "excluded" && item.index > from && item.index < to,
        )
        .map((item) => ({ id: item.chapterId, title: item.title }))
    },
  }
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

export type AudioChapterPlan = {
  trackTitle: (audiofile: string) => string | null
  chapterTitle?: ((chapterId: string) => string | null) | undefined
  excludedBetween?:
    | ((prev: string | null, next: string | null) => ExistingChapter[])
    | undefined
}

function betweenChapters(key: string): [string | null, string | null] {
  const slots = key.split("|")
  const chapterOf = (slot: string | undefined) => {
    if (!slot) return null
    return slot.split("\0")[0] ?? null
  }
  return [chapterOf(slots[0]), chapterOf(slots[1])]
}

export function planAudioChapters(
  holes: Hole[],
  behaviour: RangeBehaviour,
  durations: Record<string, number>,
  plan: AudioChapterPlan,
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

  const wholeTitledTrack = (hole: Hole) =>
    hole.start === 0 &&
    hole.end === (durations[hole.audiofile] ?? 0) &&
    plan.trackTitle(hole.audiofile) !== null

  const chapters: AudioChapter[] = []
  for (const [key, group] of groups) {
    const runs: { anchor: HoleAnchor; holes: Hole[] }[] = []
    for (const hole of group) {
      const current = runs.at(-1)
      if (!current || wholeTitledTrack(hole)) {
        runs.push({ anchor: hole.anchor, holes: [hole] })
        continue
      }
      current.holes.push(hole)
    }

    const kept: AudioChapter[] = []
    for (const run of runs) {
      if (holeSeconds(run.holes) < threshold) {
        remaining.push(...run.holes)
        continue
      }
      const title =
        run.holes
          .filter((hole) => {
            const duration = durations[hole.audiofile] ?? 0
            return duration > 0 && (hole.end - hole.start) / duration >= 0.5
          })
          .map((hole) => plan.trackTitle(hole.audiofile))
          .find((candidate) => candidate !== null) ?? null
      kept.push({
        anchor: run.anchor,
        holes: run.holes,
        title,
        anchorTitle: plan.chapterTitle?.(run.anchor.chapterId) ?? null,
        existing: null,
      })
    }

    const [prev, next] = betweenChapters(key)
    const excluded = plan.excludedBetween?.(prev, next) ?? []
    const only = kept.length === 1 ? kept[0] : null
    const reuse = excluded.length === 1 ? excluded[0] : null
    if (only && reuse) only.existing = reuse
    chapters.push(...kept)
  }

  return { chapters, remaining }
}
