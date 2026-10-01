import { basename } from "node:path"

import { type WrittenAudioChapter } from "./audioChapters.tsx"
import { type SentenceRange } from "./getSentenceRanges.ts"
import { type Hole } from "./holes.ts"
import {
  type ExcludedRange,
  type ReportChunkDebug,
  type ReportHole,
  type ReportSpineItem,
  type ReportTrack,
  type ReportV4,
  type SentenceContext,
  assembleReport,
  buildChapterSpans,
  roundSeconds,
} from "./report-v4.ts"

export type PendingSpineItem = Pick<
  ReportSpineItem,
  | "index"
  | "href"
  | "title"
  | "status"
  | "sentenceCount"
  | "preview"
  | "classification"
  | "decision"
> & { chapterId: string }

export type TrackSourceLike = {
  source: string
  start: number
  end: number
  title?: string | null
}

export type ReportBuilderInput = {
  aligner: ReportV4["aligner"]
  autoExclude: boolean
  audiofiles: string[]
  durations: Record<string, number>
  sources: Map<string, TrackSourceLike | null>
  spineIndex: Map<string, number>
  pending: Iterable<PendingSpineItem>
  ranges: SentenceRange[]
  holes: Hole[]
  audioChapters: WrittenAudioChapter[]
  excludedAudio: [string, [number, number]][]
  sentenceScore: (chapterId: string, id: number) => number | null
  chapterSentences: (chapterId: string) => Promise<{ text: string }[]>
  debugChunks?: ReportChunkDebug[]
}

export async function buildAlignerReport(
  input: ReportBuilderInput,
): Promise<ReportV4> {
  const trackIndex = new Map(input.audiofiles.map((file, i) => [file, i]))
  const indexOf = (chapterId: string, fallback: number) =>
    input.spineIndex.get(chapterId) ?? fallback
  const rangesByChapter = new Map<string, SentenceRange[]>()
  for (const range of input.ranges) {
    const list = rangesByChapter.get(range.chapterId) ?? []
    list.push(range)
    rangesByChapter.set(range.chapterId, list)
  }

  const spine: Parameters<typeof assembleReport>[0]["spine"] = []
  const spans: ReportV4["spans"] = []
  const remapped = new Map<number, number>()

  const audioChapterIds = new Set(
    input.audioChapters.map((chapter) => chapter.id),
  )

  for (const pendingItem of input.pending) {
    if (audioChapterIds.has(pendingItem.chapterId)) continue
    const { chapterId, ...original } = pendingItem
    const item = { ...original, index: indexOf(chapterId, original.index) }
    remapped.set(original.index, item.index)
    let firstMatch: SentenceContext | null = null
    let lastMatch: SentenceContext | null = null

    if (item.sentenceCount > 0) {
      const chapterSpans = buildChapterSpans({
        spine: item.index,
        sentenceCount: item.sentenceCount,
        ranges: rangesByChapter.get(chapterId) ?? [],
        trackIndex: (audiofile) => trackIndex.get(audiofile) ?? -1,
        sentenceScore: (id) => input.sentenceScore(chapterId, id),
      })
      spans.push(...chapterSpans)

      const aligned = chapterSpans.filter((span) => span.state === "aligned")
      const first = aligned[0]
      const last = aligned.at(-1)
      if (first && last) {
        const sentences = await input.chapterSentences(chapterId)
        const context = (id: number): SentenceContext => ({
          prevSentence: sentences[id - 1]?.text ?? null,
          matchedSentence: sentences[id]?.text ?? "",
          nextSentence: sentences[id + 1]?.text ?? null,
        })
        firstMatch = context(first.firstSentence)
        lastMatch = context(last.lastSentence)
      }
    }

    spine.push({ ...item, firstMatch, lastMatch })
  }

  for (const chapter of input.audioChapters) {
    spine.push({
      index: indexOf(chapter.id, -1),
      href: chapter.href,
      title: chapter.title,
      status: "audio-only",
      classification: null,
      decision: null,
      sentenceCount: 0,
      firstMatch: null,
      lastMatch: null,
      preview: null,
    })
  }

  const reportHoles: ReportHole[] = []
  const toAudio = (hole: Hole) => ({
    track: trackIndex.get(hole.audiofile) ?? -1,
    start: roundSeconds(hole.start),
    end: roundSeconds(hole.end),
  })
  for (const hole of input.holes) {
    reportHoles.push({
      spine: indexOf(hole.anchor.chapterId, -1),
      sentence: hole.anchor.sentenceId,
      position: hole.anchor.position,
      audio: toAudio(hole),
    })
  }
  for (const chapter of input.audioChapters) {
    for (const hole of chapter.holes) {
      reportHoles.push({
        spine: indexOf(chapter.id, -1),
        sentence: 0,
        position: "after",
        audio: toAudio(hole),
      })
    }
  }

  const tracks: Omit<
    ReportTrack,
    "matchedSeconds" | "interpolatedSeconds" | "looseSeconds" | "excluded"
  >[] = []
  let offset = 0
  for (const [index, audiofile] of input.audiofiles.entries()) {
    const duration = input.durations[audiofile] ?? 0
    const source = input.sources.get(audiofile) ?? null
    tracks.push({
      index,
      name: basename(audiofile),
      duration: roundSeconds(duration),
      offset: roundSeconds(offset),
      source: source
        ? {
            file: source.source,
            start: source.start,
            end: source.end,
            title: source.title ?? null,
          }
        : null,
    })
    offset += duration
  }

  const excludedAudio = new Map<number, ExcludedRange[]>()
  for (const [audiofile, [start, end]] of input.excludedAudio) {
    const index = trackIndex.get(audiofile)
    if (index === undefined) continue
    const list = excludedAudio.get(index) ?? []
    list.push({ start: roundSeconds(start), end: roundSeconds(end) })
    excludedAudio.set(index, list)
  }

  return assembleReport({
    aligner: input.aligner,
    autoExclude: input.autoExclude,
    spine,
    tracks,
    spans,
    holes: reportHoles,
    excludedAudio,
    ...(input.debugChunks && {
      debug: {
        chunks: input.debugChunks.map((chunk) => ({
          ...chunk,
          spine: remapped.get(chunk.spine) ?? chunk.spine,
        })),
      },
    }),
  })
}
