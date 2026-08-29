import type z from "zod"

import {
  type AlignmentOverrides,
  type AlignmentSummary,
  type AnyReport,
} from "@/database/alignmentReports"
import { type UUID } from "@/uuid"

import {
  type AlignmentReportViewSchemaV2,
  type ReportAudioFileSchemaV2,
  type ReportChapterRowSchemaV2,
  type ReportFlagSchemaV2,
  type ReportUnalignedAudioSchemaV2,
  type ReportUnalignedChapterSchemaV2,
} from "./schemas/v2/alignmentReport"

export type FlagTone = z.infer<(typeof ReportFlagSchemaV2)["shape"]["tone"]>
export type ReportFlag = z.infer<typeof ReportFlagSchemaV2>

export type ReportAudioFile = z.infer<typeof ReportAudioFileSchemaV2>

export type ReportChapterRow = z.infer<typeof ReportChapterRowSchemaV2>

export type ReportUnalignedChapter = z.infer<
  typeof ReportUnalignedChapterSchemaV2
>

export type ReportUnalignedAudio = z.infer<typeof ReportUnalignedAudioSchemaV2>

export interface AlignmentFacets {
  grades: Record<string, number>
  total: number
  muted: number
}

export type BookAlignmentReportView = z.infer<
  typeof AlignmentReportViewSchemaV2
>

type ManifestLike = {
  readingOrder?: { href?: string; title?: string; duration?: number }[]
  toc?: { href?: string; title?: string }[]
}

type RawChapter = AnyReport["chapters"][number]

type SentenceContext = RawChapter["firstMatchedSentenceContext"]

type TranscriptionContext = { before: string; after: string }

export type MergedChapter = {
  href: string
  chapterSentenceCount: number
  alignedSentenceCount: number
  firstMatchedSentenceId: number
  lastMatchedSentenceId: number
  firstMatchedSentenceContext: SentenceContext
  lastMatchedSentenceContext: SentenceContext
  transcriptionContext?: TranscriptionContext
  endTranscriptionContext?: TranscriptionContext
  audioFiles: { filepath: string; start: number; end: number }[]
}

function mergeAudioFiles(
  files: { filepath: string; start: number; end: number }[],
): { filepath: string; start: number; end: number }[] {
  const merged: { filepath: string; start: number; end: number }[] = []
  for (const file of files) {
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

function toMerged(chapter: RawChapter): MergedChapter {
  return {
    href: chapter.href,
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

export function mergeChapterChunks(chapters: RawChapter[]): MergedChapter[] {
  const merged: MergedChapter[] = []
  const indexByHref = new Map<string, number>()

  for (const chapter of chapters) {
    const index = indexByHref.get(chapter.href)
    const existing = index === undefined ? undefined : merged[index]

    if (!existing) {
      indexByHref.set(chapter.href, merged.length)
      merged.push(toMerged(chapter))
      continue
    }

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

function baseKey(path: string): string {
  const base = path.split("/").pop() ?? path
  return base.replace(/\.[^.]+$/, "").toLowerCase()
}

function commonPrefix(names: string[]): string {
  if (names.length === 0) return ""
  let prefix = names[0] ?? ""
  for (const name of names) {
    while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1)
    if (!prefix) return ""
  }
  const sep = Math.max(prefix.lastIndexOf("_"), prefix.lastIndexOf("-"))
  return sep >= 0 ? prefix.slice(0, sep + 1) : prefix
}

function audioMetaFromManifest(
  manifest: ManifestLike | null,
): Map<string, { title: string | null; duration: number | null }> {
  const map = new Map<
    string,
    { title: string | null; duration: number | null }
  >()
  for (const item of manifest?.readingOrder ?? []) {
    if (!item.href) continue
    map.set(baseKey(item.href), {
      title: item.title ?? null,
      duration: item.duration ?? null,
    })
  }
  return map
}

function chapterTitlesFromManifest(
  manifest: ManifestLike | null,
): Map<string, string> {
  const map = new Map<string, string>()
  const add = (href?: string, title?: string) => {
    if (!href || !title) return
    map.set(baseKey(href), title)
  }
  for (const item of manifest?.readingOrder ?? []) add(item.href, item.title)
  for (const item of manifest?.toc ?? []) add(item.href, item.title)
  return map
}

function chapterDiagnostics(ch: MergedChapter): {
  flags: ReportFlag[]
  flagged: boolean
} {
  const flags: ReportFlag[] = []
  const files = ch.audioFiles
  const count = ch.chapterSentenceCount || 0
  const aligned = ch.alignedSentenceCount

  if (files.length === 0) {
    flags.push({ label: "no audio", tone: "poor" })
  } else if (files.length > 1) {
    if (files[0] && files[0].end < 2) {
      flags.push({ label: "near-zero clip", tone: "moderate" })
    } else {
      flags.push({ label: "cross-file", tone: "info" })
    }
  } else if (files[0]) {
    const span = files[0].end - files[0].start
    if (Math.abs(span) < 1)
      flags.push({ label: "near-zero clip", tone: "moderate" })
    else if (span < 0) flags.push({ label: "reversed clip", tone: "poor" })
  }

  if (count > 0 && aligned === 0) {
    flags.push({ label: "no matches", tone: "poor" })
  }
  if (count === 0) flags.push({ label: "empty", tone: "info" })

  const badFirst = ch.firstMatchedSentenceId > 0
  const badLast = count > 0 && ch.lastMatchedSentenceId < count - 1
  if (badFirst) flags.push({ label: "late start", tone: "moderate" })
  if (badLast) flags.push({ label: "early end", tone: "moderate" })

  const hard = flags.some((f) => f.tone !== "info")
  const flagged = hard || (count > 0 && count - aligned > 5)
  return { flags, flagged }
}

export function buildReportView(args: {
  report: AnyReport
  bookUuid: UUID
  bookTitle: string | null
  reportUuid: UUID
  jobUuid: UUID | null
  createdAt: string
  summary: AlignmentSummary
  overrides?: AlignmentOverrides | null
  ebookManifest: ManifestLike | null
  audiobookManifest: ManifestLike | null
}): BookAlignmentReportView {
  const { report } = args
  const overrides = args.overrides ?? null
  const audioMeta = audioMetaFromManifest(args.audiobookManifest)
  const chapterTitles = chapterTitlesFromManifest(args.ebookManifest)

  const durationByFile = new Map<string, number>()
  let totalAudioDuration = 0
  let alignedAudioDuration = 0
  for (const af of report.audioFiles) {
    durationByFile.set(baseKey(af.filepath), af.duration)
    totalAudioDuration += af.duration
    alignedAudioDuration += af.alignedDuration
  }

  const rawUnalignedChapters: AnyReport["unalignedChapters"][number][] =
    report.unalignedChapters
  const rawUnalignedAudioFiles: AnyReport["unalignedAudioFiles"][number][] =
    report.unalignedAudioFiles

  const mergedChapters = mergeChapterChunks(report.chapters)

  const chapterPrefix = commonPrefix(
    mergedChapters.map((ch) => baseKey(ch.href)),
  )
  const unalignedPrefix = commonPrefix(
    rawUnalignedChapters.map((uc) => baseKey(uc.href)),
  )
  const strip = (key: string, prefix: string) =>
    prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key

  const chapters: ReportChapterRow[] = mergedChapters.map((ch) => {
    const key = baseKey(ch.href)
    const title = chapterTitles.get(key) ?? null
    const count = ch.chapterSentenceCount || 0
    const delta = Math.max(count - ch.alignedSentenceCount, 0)
    const { flags, flagged } = chapterDiagnostics(ch)
    return {
      href: ch.href,
      label: title ?? strip(key, chapterPrefix),
      title,
      audioFiles: ch.audioFiles.map((af) => {
        const fileKey = baseKey(af.filepath)
        const meta = audioMeta.get(fileKey)
        return {
          filepath: af.filepath,
          title: meta?.title ?? null,
          duration: meta?.duration ?? durationByFile.get(fileKey) ?? null,
          start: af.start,
          end: af.end,
        }
      }),
      chapterSentenceCount: ch.chapterSentenceCount,
      alignedSentenceCount: ch.alignedSentenceCount,
      coverage: count > 0 ? Math.min(1, ch.alignedSentenceCount / count) : null,
      delta,
      deltaPct: count > 0 ? delta / count : 0,
      flagged,
      flags,
      firstMatchedSentenceId: ch.firstMatchedSentenceId,
      lastMatchedSentenceId: ch.lastMatchedSentenceId,
      firstMatchedSentenceContext: ch.firstMatchedSentenceContext,
      lastMatchedSentenceContext: ch.lastMatchedSentenceContext,
      ...(ch.transcriptionContext && {
        transcriptionContext: ch.transcriptionContext,
      }),
      ...(ch.endTranscriptionContext && {
        endTranscriptionContext: ch.endTranscriptionContext,
      }),
      markedOk: overrides?.chapters?.[ch.href]?.markedOk ?? false,
      excludedFromScore:
        overrides?.chapters?.[ch.href]?.excludeFromScore ?? false,
    }
  })

  const unalignedChapters: ReportUnalignedChapter[] = rawUnalignedChapters.map(
    (uc) => ({
      href: uc.href,
      label:
        chapterTitles.get(baseKey(uc.href)) ??
        strip(baseKey(uc.href), unalignedPrefix),
      reason: uc.reason,
      preview:
        uc.reason === "not-found"
          ? uc.start.replace(/\n/g, " ").trim().slice(0, 160) || null
          : null,
      intended: overrides?.unalignedChapters?.[uc.href]?.intended ?? false,
    }),
  )

  const unalignedAudioFiles: ReportUnalignedAudio[] =
    rawUnalignedAudioFiles.map((uaf) => {
      const key = baseKey(uaf.filepath)
      const meta = audioMeta.get(key)
      const duration = "duration" in uaf ? uaf.duration : null
      const transcription =
        "transcription" in uaf ? uaf.transcription?.text ?? null : null
      return {
        filepath: uaf.filepath,
        title: meta?.title ?? null,
        duration: duration ?? meta?.duration ?? durationByFile.get(key) ?? null,
        transcription,
        excluded: overrides?.audioFiles?.[uaf.filepath]?.excluded ?? false,
      }
    })

  let totalSentences = 0
  let alignedSentences = 0
  let significantChapters = 0
  for (const ch of chapters) {
    if (ch.coverage == null || ch.markedOk || ch.excludedFromScore) continue
    totalSentences += ch.chapterSentenceCount
    alignedSentences += ch.alignedSentenceCount
    if (ch.delta > 5 && ch.coverage < 0.95) significantChapters += 1
  }

  return {
    bookUuid: args.bookUuid,
    bookTitle: args.bookTitle,
    reportUuid: args.reportUuid,
    jobUuid: args.jobUuid,
    createdAt: args.createdAt,
    summary: args.summary,
    totalAudioDuration,
    alignedAudioDuration,
    totalSentences,
    alignedSentences,
    significantChapters,
    chapters,
    unalignedChapters,
    unalignedAudioFiles,
  }
}
