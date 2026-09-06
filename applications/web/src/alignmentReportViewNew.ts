import type z from "zod"

import {
  type AlignmentOverrides,
  type AnyReport,
} from "@/database/alignmentReports"
import { type AlignmentGrade } from "@/shelves"
import { type UUID } from "@/uuid"

import {
  AudioChunk,
  type AlignmentReportSummarySchemaV2,
  type AlignmentReportViewSchemaV2,
  type ReportAudioChunkSchemaV2,
  type ReportChapterItemSchemaV2,
  type ReportRangeToneSchemaV2,
  type ReportSpineItemSchemaV2,
  // type ReportStripFileSchemaV2,
  type ReportUnalignedItemSchemaV2,
  type SentenceContextSchemaV2,
} from "./schemas/v2/alignmentReport"
import { audio } from "motion/react-client"
import { treeifyError } from "zod"
import { turborepoTraceAccess } from "next/dist/build/turborepo-access-trace"
import { name } from "@speed-highlight/core/languages/xml.js"
import { ExtractedEbookManifest } from "./assets/library/scanner/steps/extract-manifest"
import { Ebook } from "./database/books"
import { type ReadiumWebPublicationManifest } from "@storyteller-platform/align/readium"

export type MatchContext = z.infer<typeof SentenceContextSchemaV2>

export type ReportRangeTone = z.infer<typeof ReportRangeToneSchemaV2>

export type ReportChapterAudio = z.infer<typeof ReportAudioChunkSchemaV2>

export type ReportChapterItem = z.infer<typeof ReportChapterItemSchemaV2>

export type ReportUnalignedItem = z.infer<typeof ReportUnalignedItemSchemaV2>

export type ReportSpineItem = z.infer<typeof ReportSpineItemSchemaV2>

// export type ReportStripFile = z.infer<typeof ReportStripFileSchemaV2>

export type AlignmentReportSummary = z.infer<
  typeof AlignmentReportSummarySchemaV2
>

export type BookAlignmentReportView = z.infer<
  typeof AlignmentReportViewSchemaV2
>

export interface AlignmentFacets {
  grades: Record<string, number>
  total: number
  muted: number
}

export const GRADE_BANDS = [
  { min: 95, grade: "S" },
  { min: 90, grade: "A" },
  { min: 85, grade: "A-" },
  { min: 80, grade: "B" },
  { min: 75, grade: "B-" },
  { min: 70, grade: "C" },
  { min: 60, grade: "D" },
  { min: Number.NEGATIVE_INFINITY, grade: "F" },
] as const satisfies readonly { min: number; grade: AlignmentGrade }[]

const FAILING_BAND = GRADE_BANDS.length - 1

const PROMO_PATTERN = /discover|praise|newsletter|sneak/i

export function gradeForScore(score: number | null): {
  grade: AlignmentGrade
  band: number
} {
  if (score === null) return { grade: "F", band: FAILING_BAND }
  const band = GRADE_BANDS.findIndex(({ min }) => score >= min)
  const entry = GRADE_BANDS[band]
  if (!entry) return { grade: "F", band: FAILING_BAND }
  return { grade: entry.grade, band }
}

type ManifestLike = {
  readingOrder?: { href?: string; title?: string; duration?: number }[]
  toc?: { href?: string; title?: string }[]
}

type RawChapter = AnyReport["chapters"][number]

type RawUnalignedChapter = AnyReport["unalignedChapters"][number]

type RawUnalignedAudio = AnyReport["unalignedAudioFiles"][number]

type RawAudioFile = AnyReport["audioFiles"][number]

export type ReportLike = {
  chapters: RawChapter[]
  unalignedChapters?: RawUnalignedChapter[]
  audioFiles?: RawAudioFile[]
  unalignedAudioFiles?: RawUnalignedAudio[]
}

type TranscriptionContext = { before: string; after: string }

export type MergedChapter = {
  href: string
  spineIndex: number
  score: number
  chapterSentenceCount: number
  alignedSentenceCount: number
  firstMatchedSentenceId: number
  lastMatchedSentenceId: number
  firstMatchedSentenceContext: MatchContext
  lastMatchedSentenceContext: MatchContext
  transcriptionContext?: TranscriptionContext
  endTranscriptionContext?: TranscriptionContext
  audioFiles: { filepath: string; start: number; end: number }[]
}

function mergeAudioFiles(
  files: { filepath: string; start: number; end: number }[],
): { filepath: string; start: number; end: number }[] {
  const merged: { filepath: string; start: number; end: number }[] = []
  for (const file of files) {
    if (!file.filepath) continue
    const existing = merged.find((f) => f.filepath === file.filepath)
    if (existing) {
      existing.start = Math.min(existing.start, file.start)
      existing.end = Math.max(existing.end, file.end)
    } else {
      merged.push({ ...file })
    }
  }
  return merged
}

function chapterScore(chapter: RawChapter): number {
  const raw: Partial<RawChapter> = chapter
  if (typeof raw.score === "number" && Number.isFinite(raw.score)) {
    return Math.min(Math.max(raw.score, 0), 100)
  }
  const count = chapter.chapterSentenceCount || 0
  return count > 0
    ? Math.min((chapter.alignedSentenceCount / count) * 100, 100)
    : 0
}

function toMerged(chapter: RawChapter, fallbackIndex: number): MergedChapter {
  const raw: Partial<RawChapter> = chapter
  return {
    href: chapter.href,
    spineIndex:
      typeof raw.spineIndex === "number" ? raw.spineIndex : fallbackIndex,
    score: chapterScore(chapter),
    chapterSentenceCount: chapter.chapterSentenceCount,
    alignedSentenceCount: chapter.alignedSentenceCount,
    firstMatchedSentenceId: chapter.firstMatchedSentenceId,
    lastMatchedSentenceId: chapter.lastMatchedSentenceId,
    firstMatchedSentenceContext: chapter.firstMatchedSentenceContext,
    lastMatchedSentenceContext: chapter.lastMatchedSentenceContext,
    ...("transcriptionContext" in chapter && {
      transcriptionContext: chapter.transcriptionContext,
    }),
    ...("endTranscriptionContext" in chapter && {
      endTranscriptionContext: chapter.endTranscriptionContext,
    }),
    audioFiles: mergeAudioFiles(chapter.audioFiles),
  }
}

// export type AudioChunk = {
//   start: number
//   end: number
//   filepath: string
//   placed: boolean
//   excluded: boolean
//   percentageOfTotal: number
//   duration: number
//   totalDuration: number
//   sharedWith: string[]
// }

export function mergeChapterChunks(chapters: RawChapter[]): MergedChapter[] {
  const merged: MergedChapter[] = []
  const indexByHref = new Map<string, number>()

  for (const chapter of chapters) {
    const index = indexByHref.get(chapter.href)
    const existing = index === undefined ? undefined : merged[index]

    if (!existing) {
      indexByHref.set(chapter.href, merged.length)
      merged.push(toMerged(chapter, merged.length))
      continue
    }

    const score = chapterScore(chapter)
    const totalCount =
      existing.chapterSentenceCount + chapter.chapterSentenceCount
    existing.score =
      totalCount > 0
        ? (existing.score * existing.chapterSentenceCount +
            score * chapter.chapterSentenceCount) /
          totalCount
        : (existing.score + score) / 2
    existing.chapterSentenceCount += chapter.chapterSentenceCount
    existing.alignedSentenceCount += chapter.alignedSentenceCount
    existing.firstMatchedSentenceId = Math.min(
      existing.firstMatchedSentenceId,
      chapter.firstMatchedSentenceId,
    )
    existing.lastMatchedSentenceId = Math.max(
      existing.lastMatchedSentenceId,
      chapter.lastMatchedSentenceId,
    )
    existing.lastMatchedSentenceContext = chapter.lastMatchedSentenceContext
    if ("endTranscriptionContext" in chapter) {
      existing.endTranscriptionContext = chapter.endTranscriptionContext
    }
    existing.audioFiles = mergeAudioFiles([
      ...existing.audioFiles,
      ...chapter.audioFiles,
    ])
  }

  return merged
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path
}

function stem(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "")
}

function baseKey(path: string): string {
  return stem(path).toLowerCase()
}
type BuildReportModelArgs = {
  report: ReportLike
  overrides?: AlignmentOverrides | null
  ebookManifest?: ReadiumWebPublicationManifest | null
  audiobookManifest?: ManifestLike | null
}

export function buildReportModel({
  report,
  overrides,
  ebookManifest,
  // audiobookManifest,
}: BuildReportModelArgs): {
  summary: AlignmentReportSummary
  items: ReportSpineItem[]
  audioFiles: Record<string, AudioChunk[]>
} {
  const audioFiles = [
    ...(report.audioFiles ?? []).map((file) => ({
      ...file,
      placed: true as const,
      filepath: fileName(file.filepath),
      matchedRanges: [],
      between: { before: null, after: null },
    })),
    ...(report.unalignedAudioFiles ?? []).map((file) => ({
      ...file,
      placed: false as const,
      filepath: fileName(file.filepath),
      ranges: [],
      between: { before: null, after: null },
    })),
  ].sort((a, b) => a.filepath.localeCompare(b.filepath)) as ReportStripFile[]

  const audioTotalSeconds = audioFiles.reduce(
    (acc, file) => acc + (file.duration ?? 0),
    0,
  )

  const audioPlacedSeconds = audioFiles.reduce(
    (acc, file) => (file.placed ? file.alignedDuration + acc : acc),
    0,
  )

  const mergedChapters = mergeChapterChunks(report.chapters)

  const manifestToCMap = new Map(
    ebookManifest?.toc
      ?.map((entry) =>
        entry.href ? ([stem(entry.href), entry] as const) : null,
      )
      .filter((x) => x !== null) ?? [],
  )
  console.log(Array.from(manifestToCMap.entries()))

  const audioMap = new Map(audioFiles.map((file) => [file.filepath, file]))

  console.log(
    "MCH1",
    mergedChapters[0],
    stem(mergedChapters[0]?.href),
    manifestToCMap.get(stem(mergedChapters[0]?.href)),
  )

  const items = [
    ...mergedChapters.map(
      (chapter) =>
        ({
          kind: "chapter" as const,
          href: chapter.href,
          label: manifestToCMap.get(stem(chapter.href))?.title ?? null,
          spineIndex: chapter.spineIndex,
          chapterSentenceCount: chapter.chapterSentenceCount,
          alignedSentenceCount: chapter.alignedSentenceCount,
          confidence: chapter.score,
          judgment: overrides?.chapters?.[stem(chapter.href)]?.ignored
            ? "excluded"
            : null,
          firstMatch: {
            prevSentence: chapter.firstMatchedSentenceContext.prevSentence,
            matchedSentence:
              chapter.firstMatchedSentenceContext.matchedSentence,
            nextSentence: chapter.firstMatchedSentenceContext.nextSentence,
          },
          lastMatch: {
            prevSentence: chapter.lastMatchedSentenceContext.prevSentence,
            matchedSentence: chapter.lastMatchedSentenceContext.matchedSentence,
            nextSentence: chapter.lastMatchedSentenceContext.nextSentence,
          },
          missing: 0,
          audio: chapter.audioFiles.map((au) => {
            const audioFile = audioMap.get(fileName(au.filepath))
            if (!audioFile) {
              return null
            }
            return {
              start: au.start,
              end: au.end,
              filepath: au.filepath,
              name: fileName(au.filepath),
              placed: true,
              excluded: overrides?.audioFiles?.[au.filepath]?.ignored ?? false,
              percentageOfTotal:
                (au.end - au.start) / (audioFile.duration ?? 0),
              totalDuration: audioFile.duration ?? 0,
            }
          }),
          // audio: chapter.audioFiles.map((au) => ({
          //   name: fileName(au.filepath),
          //   filepath: au.filepath,
          //   start: au.start,
          //   end: au.end,
          //   seconds: au.end - au.start,
          //   sharedWith: [],
          // })),
        }) as ReportChapterItem,
    ),
    ...(report.unalignedChapters?.map((chapter) => ({
      kind: "unaligned" as const,
      ...chapter,
      judgment: overrides?.chapters?.[stem(chapter.href)]?.ignored
        ? "excluded"
        : null,
      confidence: 0,
      label:
        ebookManifest?.readingOrder?.find(
          (entry) => entry.href === chapter.href,
        )?.title ?? null,
      needsLook: chapter.reason === "needs-look",
      // notFoundBody:
      // noAudio: chapter?.
      spineIndex: "spineIndex" in chapter ? chapter.spineIndex : null,
      chapterSentenceCount:
        "chapterSentenceCount" in chapter ? chapter.chapterSentenceCount : null,
    })) ?? []),
  ]
    .map((item, index) => ({ item, index }))
    // kinda annoying sort bc not all items have spineIndex
    .sort((a, b) => {
      const left = a.item.spineIndex
      const right = b.item.spineIndex
      if (left === null && right === null) return a.index - b.index
      if (left === null) return -1
      if (right === null) return 1
      return left - right || a.index - b.index
    })
    .map(({ item }) => item) as ReportSpineItem[]

  const sentencesAligned = mergedChapters.reduce(
    (acc, chapter) => chapter.alignedSentenceCount + acc,
    0,
  )

  const sentencesTotal = items.reduce(
    (acc, item) =>
      (item.judgment !== "excluded" ? item.chapterSentenceCount ?? 0 : 0) + acc,
    0,
  )

  const placedAudioChunkMap = new Map<string, AudioChunk[]>()

  for (const chapter of mergedChapters) {
    for (const audio of chapter.audioFiles) {
      const file = audioMap.get(fileName(audio.filepath))
      if (!file) {
        continue
      }

      const totalDuration = file.duration ?? 0
      // check if we don't already have a chunk for this file
      const existingPlacedAudio = placedAudioChunkMap.get(
        fileName(audio.filepath),
      )
      if (existingPlacedAudio) {
        existingPlacedAudio.push({
          start: audio.start,
          end: audio.end,
          filepath: audio.filepath,
          excluded: overrides?.audioFiles?.[audio.filepath]?.ignored ?? false,
          placed: true,
          duration: audio.end - audio.start,
          sharedWith: [
            { href: chapter.href, label: chapter.href, role: "after" },
          ],
          totalDuration,
          percentageOfTotal: (audio.end - audio.start) / totalDuration,
          name: fileName(audio.filepath),
        })
        continue
      }

      placedAudioChunkMap.set(fileName(audio.filepath), [
        {
          start: audio.start,
          end: audio.end,
          filepath: audio.filepath,
          excluded: overrides?.audioFiles?.[audio.filepath]?.ignored ?? false,
          placed: true,
          duration: audio.end - audio.start,
          sharedWith: [
            { href: chapter.href, label: chapter.href, role: "after" },
          ],
          totalDuration,
          percentageOfTotal: (audio.end - audio.start) / totalDuration,
          name: fileName(audio.filepath),
        },
      ])
    }
  }

  const completeAudioChunkMap = new Map<string, AudioChunk[]>()
  for (const audio of audioFiles) {
    const existingCompleteAudio = completeAudioChunkMap.get(audio.filepath)
    const existingPlacedAudio = placedAudioChunkMap.get(audio.filepath)
    if (existingCompleteAudio) {
      // unclear how that happened
      continue
    }

    if (!existingPlacedAudio) {
      completeAudioChunkMap.set(audio.filepath, [
        {
          placed: false,
          start: 0,
          end: audio.duration ?? 0,
          filepath: audio.filepath,
          excluded: overrides?.audioFiles?.[audio.filepath]?.ignored ?? false,
          duration: audio.duration ?? 0,
          sharedWith: [],
          percentageOfTotal: 100,
          totalDuration: audio.duration ?? 0,
          name: fileName(audio.filepath),
        },
      ])
      continue
    }

    // we have placed this audio
    if (existingPlacedAudio) {
      const sortedPlacedAudio = existingPlacedAudio.sort(
        (a, b) => a.start - b.start,
      )
      // should check for overlaps, but eh
      const hasOverlaps = sortedPlacedAudio.some((audio, index) => {
        const nextAudio = sortedPlacedAudio[index + 1]
        if (!nextAudio) return false
        return audio.end > nextAudio.start
      })

      const firstPlacedAudio = sortedPlacedAudio[0]
      if (!firstPlacedAudio) {
        // unclear
        continue
      }

      const offsetToFirstPlacedAudio = firstPlacedAudio.start

      const completedAudioChunks = [] as AudioChunk[]
      completeAudioChunkMap.set(audio.filepath, completedAudioChunks)

      // some leeway
      if (offsetToFirstPlacedAudio > 0.1) {
        completedAudioChunks.push({
          placed: false,
          start: 0,
          end: offsetToFirstPlacedAudio,
          filepath: audio.filepath,
          excluded: overrides?.audioFiles?.[audio.filepath]?.ignored ?? false,
          duration: offsetToFirstPlacedAudio,
          sharedWith: [],
          percentageOfTotal: offsetToFirstPlacedAudio / (audio.duration ?? 0),
          totalDuration: audio.duration ?? 0,
          name: fileName(audio.filepath),
        })
        // continue
      }
      for (const [index, placedAudio] of sortedPlacedAudio.entries()) {
        // does this have any gap with the last placed?
        const lastPlacedAudio = completedAudioChunks.at(-1)
        // we have a gap
        if (lastPlacedAudio && placedAudio.start > lastPlacedAudio.end + 1) {
          completedAudioChunks.push({
            placed: false,
            start: lastPlacedAudio.end,
            end: placedAudio.start,
            filepath: audio.filepath,
            excluded: overrides?.audioFiles?.[audio.filepath]?.ignored ?? false,
            duration: placedAudio.start - lastPlacedAudio.end,
            sharedWith: [],
            percentageOfTotal:
              (placedAudio.start - lastPlacedAudio.end) / (audio.duration ?? 0),
            totalDuration: audio.duration ?? 0,
            name: fileName(audio.filepath),
          })
        }

        // now push the chunk
        completedAudioChunks.push({
          placed: true,
          start: placedAudio.start,
          end: placedAudio.end,
          filepath: audio.filepath,
          excluded: overrides?.audioFiles?.[audio.filepath]?.ignored ?? false,
          duration: placedAudio.end - placedAudio.start,
          sharedWith: placedAudio.sharedWith,
          percentageOfTotal:
            (placedAudio.end - placedAudio.start) / (audio.duration ?? 0),
          totalDuration: audio.duration ?? 0,
          name: fileName(audio.filepath),
        })
      }

      // check if the last chunk is not the end of the audio
      const lastChunk = completedAudioChunks.at(-1)
      if (lastChunk && lastChunk.end < (audio.duration ?? 0)) {
        completedAudioChunks.push({
          placed: false,
          start: lastChunk.end,
          end: audio.duration ?? 0,

          filepath: audio.filepath,
          excluded: overrides?.audioFiles?.[audio.filepath]?.ignored ?? false,
          duration: (audio.duration ?? 0) - lastChunk.end,
          sharedWith: [],
          percentageOfTotal:
            (audio.duration ?? 0 - lastChunk.end) / (audio.duration ?? 0),
          totalDuration: audio.duration ?? 0,
          name: fileName(audio.filepath),
        })
      }
    }

    // if(existingCompleteAudio) {
    //   existingCompleteAudio.push({
    //     start: 0,
    //     end: audio.duration ?? 0,
    //     filepath: audio.filepath,
    //   })
    // }
  }

  const allAudioChunks = [] as AudioChunk[]

  let confidence = 0
  for (const item of items) {
    if (item.chapterSentenceCount && item.judgment !== "excluded") {
      confidence +=
        (item.confidence * item.chapterSentenceCount) / sentencesTotal
    }
  }

  const excluded = items.filter((item) => item.judgment === "excluded").length

  // const noAudio = items.filter(
  //   (item) => item.kind === "chapter" && item.audio.length === 0,
  // ).length

  // const audioFiles = Object.values(completeAudioChunkMap)

  const sentenncePercentage = sentencesAligned / sentencesTotal
  const audioPercentage = audioPlacedSeconds / audioTotalSeconds
  const weightedScore = sentenncePercentage * 0.7 + audioPercentage * 0.3

  return {
    summary: {
      ...gradeForScore(weightedScore * 100),
      confidence,
      sentencesAligned,
      sentencesTotal,
      audioPlacedSeconds,
      audioTotalSeconds,
      needsLook: 0, //items.filter((item) => item.needsLook).length,
      // ignored: ignored, //items.filter((item) => item.ignored).length,
      // notFoundBody: 0,
      // noAudio,
      //chapterItems.filter(
      //     (item) => !item.ignored && item.status === "no-audio",
      //   ).length,
      // looseAudio: 0,
      // chapters: items.length,
      //   looseAudio: audioFiles.filter((file) => !file.placed && !file.ignored)
      //     .length,
      //   chapters: chapterItems.length,
    },
    items,
    audioFiles: Object.fromEntries(Array.from(completeAudioChunkMap.entries())),
  }
}

export function buildReportView(args: {
  report: AnyReport
  bookUuid: UUID
  bookTitle: string | null
  reportUuid: UUID
  jobUuid: UUID | null
  createdAt: string
  overrides?: AlignmentOverrides | null
  ebookManifest: ManifestLike | null
  audiobookManifest: ManifestLike | null
}): BookAlignmentReportView {
  const model = buildReportModel(args)

  return {
    bookUuid: args.bookUuid,
    bookTitle: args.bookTitle,
    reportUuid: args.reportUuid,
    jobUuid: args.jobUuid,
    createdAt: args.createdAt,
    ...model,
  }
}
