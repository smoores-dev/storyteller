import type {
  ChapterDecision,
  ExclusionSignal,
  ExclusionVerdict,
  SpineZone,
} from "./ctc/exclusions.ts"
import type { RangeState, SentenceRange } from "./getSentenceRanges.ts"

export const REPORT_VERSION = 4

export type SentenceContext = {
  prevSentence: string | null
  matchedSentence: string
  nextSentence: string | null
}

export type SpineStatus =
  | "aligned"
  | "not-found"
  | "too-short"
  | "excluded"
  | "audio-only"

export type ReportClassification = {
  zone: SpineZone
  verdict: ExclusionVerdict
  decidedBy: ExclusionSignal | null
  signals: ExclusionSignal[]
}

export type ReportSpineItem = {
  index: number
  href: string
  title: string | null
  status: SpineStatus
  classification: ReportClassification | null
  decision: ChapterDecision | null
  sentenceCount: number
  matchedSentenceCount: number
  interpolatedSentenceCount: number
  droppedSentenceCount: number
  matchedSeconds: number
  interpolatedSeconds: number
  looseSeconds: number
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

export type ExcludedRange = {
  start: number
  end: number
}

export type ReportTrack = {
  index: number
  name: string
  duration: number
  offset: number
  matchedSeconds: number
  interpolatedSeconds: number
  looseSeconds: number
  excluded: ExcludedRange[]
  source: ReportTrackSource | null
}

export type SpanState = "aligned" | "interpolated" | "unmatched" | "dropped"

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
    | { state: "dropped"; audio: null }
  )

export type ReportHole = {
  spine: number
  sentence: number
  position: "before" | "after"
  audio: SpanAudio
}

export type ReportTotals = {
  sentences: number
  matchedSentences: number
  interpolatedSentences: number
  unmatchedSentences: number
  droppedSentences: number
  seconds: number
  matchedSeconds: number
  interpolatedSeconds: number
  looseSeconds: number
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

export type ReportV4 = {
  version: typeof REPORT_VERSION
  aligner: "ctc" | "classic"
  autoExclude: boolean
  spine: ReportSpineItem[]
  tracks: ReportTrack[]
  spans: ReportSpan[]
  holes: ReportHole[]
  totals: ReportTotals
  debug?: ReportDebug
}

export function emptyTotals(): ReportTotals {
  return {
    sentences: 0,
    matchedSentences: 0,
    interpolatedSentences: 0,
    unmatchedSentences: 0,
    droppedSentences: 0,
    seconds: 0,
    matchedSeconds: 0,
    interpolatedSeconds: 0,
    looseSeconds: 0,
    spine: {
      aligned: 0,
      "not-found": 0,
      "too-short": 0,
      excluded: 0,
      "audio-only": 0,
    },
    tracks: 0,
    unalignedTracks: 0,
  }
}

export function emptyReport(
  aligner: ReportV4["aligner"],
  autoExclude = true,
): ReportV4 {
  return {
    version: REPORT_VERSION,
    aligner,
    autoExclude,
    spine: [],
    tracks: [],
    spans: [],
    holes: [],
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

const SPAN_STATE: Record<RangeState, SpanState> = {
  matched: "aligned",
  interpolated: "interpolated",
  unmatched: "unmatched",
  dropped: "dropped",
}

export function buildChapterSpans(input: {
  spine: number
  sentenceCount: number
  ranges: Iterable<SentenceRange>
  trackIndex: (audiofile: string) => number
  sentenceScore: (id: number) => number | null
}): ReportSpan[] {
  const byId = new Map<number, SentenceRange>()
  for (const range of input.ranges) byId.set(range.id, range)

  const states: SentenceState[] = []
  for (let id = 0; id < input.sentenceCount; id++) {
    const range = byId.get(id) ?? null
    const state = range ? SPAN_STATE[range.state] : "unmatched"
    const timed = state === "aligned" || state === "interpolated"
    states.push({ state, range: timed ? range : null })
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

    if (!head.range) {
      spans.push({
        ...text,
        state: head.state === "dropped" ? "dropped" : "unmatched",
        audio: null,
      })
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

export function spanSeconds(span: { audio: SpanAudio | null }): number {
  return span.audio ? span.audio.end - span.audio.start : 0
}

export function assembleReport(input: {
  aligner: ReportV4["aligner"]
  autoExclude: boolean
  spine: Omit<
    ReportSpineItem,
    | "matchedSentenceCount"
    | "interpolatedSentenceCount"
    | "droppedSentenceCount"
    | "matchedSeconds"
    | "interpolatedSeconds"
    | "looseSeconds"
    | "score"
  >[]
  tracks: Omit<
    ReportTrack,
    "matchedSeconds" | "interpolatedSeconds" | "looseSeconds" | "excluded"
  >[]
  spans: ReportSpan[]
  holes?: ReportHole[]
  excludedAudio?: Map<number, ExcludedRange[]>
  debug?: ReportDebug
}): ReportV4 {
  const spine: ReportSpineItem[] = input.spine
    .toSorted((a, b) => a.index - b.index)
    .map((item) => ({
      ...item,
      matchedSentenceCount: 0,
      interpolatedSentenceCount: 0,
      droppedSentenceCount: 0,
      matchedSeconds: 0,
      interpolatedSeconds: 0,
      looseSeconds: 0,
      score: null,
    }))
  const spineByIndex = new Map(spine.map((item) => [item.index, item]))

  const tracks: ReportTrack[] = input.tracks.map((track) => ({
    ...track,
    matchedSeconds: 0,
    interpolatedSeconds: 0,
    looseSeconds: 0,
    excluded: input.excludedAudio?.get(track.index) ?? [],
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
    } else if (span.state === "dropped") {
      if (item) item.droppedSentenceCount += sentences
    }
  }

  const holes = (input.holes ?? []).toSorted(
    (a, b) => a.audio.track - b.audio.track || a.audio.start - b.audio.start,
  )
  for (const hole of holes) {
    const seconds = spanSeconds(hole)
    const item = spineByIndex.get(hole.spine)
    if (item) item.looseSeconds += seconds
    const track = tracks[hole.audio.track]
    if (track) track.looseSeconds += seconds
  }

  const totals = emptyTotals()

  for (const item of spine) {
    const scores = scoreSums.get(item.index)
    item.score = scores ? roundScore(scores.sum / scores.count) : null
    item.matchedSeconds = roundSeconds(item.matchedSeconds)
    item.interpolatedSeconds = roundSeconds(item.interpolatedSeconds)
    item.looseSeconds = roundSeconds(item.looseSeconds)
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
    totals.droppedSentences += item.droppedSentenceCount
  }
  totals.unmatchedSentences =
    totals.sentences -
    totals.matchedSentences -
    totals.interpolatedSentences -
    totals.droppedSentences

  for (const track of tracks) {
    track.matchedSeconds = roundSeconds(track.matchedSeconds)
    track.interpolatedSeconds = roundSeconds(track.interpolatedSeconds)
    track.looseSeconds = roundSeconds(track.looseSeconds)
    totals.seconds += track.duration
    totals.matchedSeconds += track.matchedSeconds
    totals.interpolatedSeconds += track.interpolatedSeconds
    totals.looseSeconds += track.looseSeconds
    totals.tracks++
    if (track.matchedSeconds === 0 && track.interpolatedSeconds === 0) {
      totals.unalignedTracks++
    }
  }
  totals.seconds = roundSeconds(totals.seconds)
  totals.matchedSeconds = roundSeconds(totals.matchedSeconds)
  totals.interpolatedSeconds = roundSeconds(totals.interpolatedSeconds)
  totals.looseSeconds = roundSeconds(totals.looseSeconds)

  return {
    version: REPORT_VERSION,
    aligner: input.aligner,
    autoExclude: input.autoExclude,
    spine,
    tracks,
    spans,
    holes,
    totals,
    ...(input.debug && { debug: input.debug }),
  }
}
