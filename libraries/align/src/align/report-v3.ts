import type { SentenceRange } from "./getSentenceRanges.ts"

export const REPORT_VERSION = 3

export type SentenceContext = {
  prevSentence: string | null
  matchedSentence: string
  nextSentence: string | null
}

export type SpineStatus =
  | "aligned"
  | "not-found"
  | "too-short"
  | "is-nav"
  | "no-text"

export type ReportSpineItem = {
  index: number
  href: string
  title: string | null
  status: SpineStatus
  sentenceCount: number
  matchedSentenceCount: number
  interpolatedSentenceCount: number
  matchedSeconds: number
  interpolatedSeconds: number
  score: number | null
  firstMatch: SentenceContext | null
  lastMatch: SentenceContext | null
  preview: string | null
}

export type ReportTrackSource = {
  file: string
  start: number
  end: number
  title: string | null
}

export type ReportTrack = {
  index: number
  name: string
  duration: number
  offset: number
  matchedSeconds: number
  interpolatedSeconds: number
  source: ReportTrackSource | null
}

export type SpanState = "aligned" | "interpolated" | "unmatched"

export type SpanText = {
  spine: number
  firstSentence: number
  lastSentence: number
}

export type SpanAudio = {
  track: number
  start: number
  end: number
}

export type ReportSpan = SpanText &
  (
    | { state: "aligned"; audio: SpanAudio; score: number | null }
    | { state: "interpolated"; audio: SpanAudio }
    | { state: "unmatched"; audio: null }
  )

export type ReportTotals = {
  sentences: number
  matchedSentences: number
  interpolatedSentences: number
  unmatchedSentences: number
  seconds: number
  matchedSeconds: number
  interpolatedSeconds: number
  spine: Record<SpineStatus, number>
  tracks: number
  unalignedTracks: number
}

export type ReportChunkDebug = {
  spine: number
  chunk: number
  firstSentence: number
  lastSentence: number
  emissionsStart: number
  emissionsEnd: number
  score: number
}

export type ReportDebug = {
  chunks: ReportChunkDebug[]
}

export type ReportV3 = {
  version: typeof REPORT_VERSION
  aligner: "ctc" | "classic"
  spine: ReportSpineItem[]
  tracks: ReportTrack[]
  spans: ReportSpan[]
  totals: ReportTotals
  debug?: ReportDebug
}

export function emptyTotals(): ReportTotals {
  return {
    sentences: 0,
    matchedSentences: 0,
    interpolatedSentences: 0,
    unmatchedSentences: 0,
    seconds: 0,
    matchedSeconds: 0,
    interpolatedSeconds: 0,
    spine: {
      aligned: 0,
      "not-found": 0,
      "too-short": 0,
      "is-nav": 0,
      "no-text": 0,
    },
    tracks: 0,
    unalignedTracks: 0,
  }
}

export function emptyReport(aligner: ReportV3["aligner"]): ReportV3 {
  return {
    version: REPORT_VERSION,
    aligner,
    spine: [],
    tracks: [],
    spans: [],
    totals: emptyTotals(),
  }
}

export function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
}

type SentenceState = { state: SpanState; range: SentenceRange | null }

export function buildChapterSpans(input: {
  spine: number
  sentenceCount: number
  ranges: Iterable<SentenceRange>
  trackIndex: (audiofile: string) => number
  sentenceScore: (id: number) => number | null
}): ReportSpan[] {
  const byId = new Map<number, SentenceRange>()
  for (const range of input.ranges) byId.set(range.id, range)

  let firstAligned = -1
  let lastAligned = -1
  for (const [id, range] of byId) {
    if (range.interpolated) continue
    if (firstAligned === -1 || id < firstAligned) firstAligned = id
    if (id > lastAligned) lastAligned = id
  }

  const states: SentenceState[] = []
  for (let id = 0; id < input.sentenceCount; id++) {
    const range = byId.get(id) ?? null
    if (!range) {
      states.push({ state: "unmatched", range: null })
    } else if (!range.interpolated) {
      states.push({ state: "aligned", range })
    } else if (id > firstAligned && id < lastAligned) {
      states.push({ state: "interpolated", range })
    } else {
      states.push({ state: "unmatched", range: null })
    }
  }

  const spans: ReportSpan[] = []
  let runStart = 0
  while (runStart < states.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const head = states[runStart]!
    const track = head.range ? input.trackIndex(head.range.audiofile) : -1
    let runEnd = runStart
    while (runEnd + 1 < states.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const next = states[runEnd + 1]!
      if (next.state !== head.state) break
      if (next.range && input.trackIndex(next.range.audiofile) !== track) break
      runEnd++
    }

    const text: SpanText = {
      spine: input.spine,
      firstSentence: runStart,
      lastSentence: runEnd,
    }

    if (head.state === "unmatched" || !head.range) {
      spans.push({ ...text, state: "unmatched", audio: null })
    } else {
      let start = head.range.start
      let end = head.range.end
      let scoreSum = 0
      let scoreCount = 0
      for (let id = runStart; id <= runEnd; id++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const range = states[id]!.range!
        start = Math.min(start, range.start)
        end = Math.max(end, range.end)
        const score = input.sentenceScore(id)
        if (score !== null) {
          scoreSum += score
          scoreCount++
        }
      }
      const audio: SpanAudio = {
        track,
        start: roundSeconds(start),
        end: roundSeconds(end),
      }
      if (head.state === "aligned") {
        spans.push({
          ...text,
          state: "aligned",
          audio,
          score: scoreCount > 0 ? roundScore(scoreSum / scoreCount) : null,
        })
      } else {
        spans.push({ ...text, state: "interpolated", audio })
      }
    }

    runStart = runEnd + 1
  }

  return spans
}

export function spanSentences(span: SpanText): number {
  return span.lastSentence - span.firstSentence + 1
}

export function spanSeconds(span: ReportSpan): number {
  return span.audio ? span.audio.end - span.audio.start : 0
}

export function assembleReport(input: {
  aligner: ReportV3["aligner"]
  spine: Omit<
    ReportSpineItem,
    | "matchedSentenceCount"
    | "interpolatedSentenceCount"
    | "matchedSeconds"
    | "interpolatedSeconds"
    | "score"
  >[]
  tracks: Omit<ReportTrack, "matchedSeconds" | "interpolatedSeconds">[]
  spans: ReportSpan[]
  debug?: ReportDebug
}): ReportV3 {
  const spine: ReportSpineItem[] = input.spine
    .toSorted((a, b) => a.index - b.index)
    .map((item) => ({
      ...item,
      matchedSentenceCount: 0,
      interpolatedSentenceCount: 0,
      matchedSeconds: 0,
      interpolatedSeconds: 0,
      score: null,
    }))
  const spineByIndex = new Map(spine.map((item) => [item.index, item]))

  const tracks: ReportTrack[] = input.tracks.map((track) => ({
    ...track,
    matchedSeconds: 0,
    interpolatedSeconds: 0,
  }))

  const scoreSums = new Map<number, { sum: number; count: number }>()

  const spans = input.spans.toSorted(
    (a, b) => a.spine - b.spine || a.firstSentence - b.firstSentence,
  )

  for (const span of spans) {
    const item = spineByIndex.get(span.spine)
    const track = span.audio ? tracks[span.audio.track] : undefined
    const sentences = spanSentences(span)
    const seconds = spanSeconds(span)
    if (span.state === "aligned") {
      if (item) {
        item.matchedSentenceCount += sentences
        item.matchedSeconds += seconds
        if (span.score !== null) {
          const entry = scoreSums.get(span.spine) ?? { sum: 0, count: 0 }
          entry.sum += span.score * sentences
          entry.count += sentences
          scoreSums.set(span.spine, entry)
        }
      }
      if (track) track.matchedSeconds += seconds
    } else if (span.state === "interpolated") {
      if (item) {
        item.interpolatedSentenceCount += sentences
        item.interpolatedSeconds += seconds
      }
      if (track) track.interpolatedSeconds += seconds
    }
  }

  const totals = emptyTotals()

  for (const item of spine) {
    const scores = scoreSums.get(item.index)
    item.score = scores ? roundScore(scores.sum / scores.count) : null
    item.matchedSeconds = roundSeconds(item.matchedSeconds)
    item.interpolatedSeconds = roundSeconds(item.interpolatedSeconds)
    if (
      item.status === "aligned" &&
      item.matchedSentenceCount === 0 &&
      item.sentenceCount > 0
    ) {
      item.status = "not-found"
    }
    totals.spine[item.status]++
    totals.sentences += item.sentenceCount
    totals.matchedSentences += item.matchedSentenceCount
    totals.interpolatedSentences += item.interpolatedSentenceCount
  }
  totals.unmatchedSentences =
    totals.sentences - totals.matchedSentences - totals.interpolatedSentences

  for (const track of tracks) {
    track.matchedSeconds = roundSeconds(track.matchedSeconds)
    track.interpolatedSeconds = roundSeconds(track.interpolatedSeconds)
    totals.seconds += track.duration
    totals.matchedSeconds += track.matchedSeconds
    totals.interpolatedSeconds += track.interpolatedSeconds
    totals.tracks++
    if (track.matchedSeconds === 0 && track.interpolatedSeconds === 0) {
      totals.unalignedTracks++
    }
  }
  totals.seconds = roundSeconds(totals.seconds)
  totals.matchedSeconds = roundSeconds(totals.matchedSeconds)
  totals.interpolatedSeconds = roundSeconds(totals.interpolatedSeconds)

  return {
    version: REPORT_VERSION,
    aligner: input.aligner,
    spine,
    tracks,
    spans,
    totals,
    ...(input.debug && { debug: input.debug }),
  }
}
