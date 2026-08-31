import z from "zod"

import { ALIGNMENT_GRADES } from "@/fields"
import { uuidv4 } from "@/schemas/uuid"

export const SentenceContextSchemaV2 = z.object({
  prevSentence: z.string().nullable(),
  matchedSentence: z.string(),
  nextSentence: z.string().nullable(),
})

export const TranscriptionContextSchemaV2 = z.object({
  before: z.string(),
  after: z.string(),
})

export const ReportRangeToneSchemaV2 = z.enum(["good", "moderate", "poor"])

export const ReportChapterAudioSchemaV2 = z.object({
  name: z.string().meta({ description: "The audio file's basename." }),
  filepath: z.string(),
  start: z.number(),
  end: z.number(),
  seconds: z.number(),
  sharedWith: z.array(
    z.object({
      href: z.string(),
      label: z.string(),
      role: z.enum(["before", "after"]),
    }),
  ),
})

export const ReportChapterItemSchemaV2 = z.object({
  kind: z.literal("chapter"),
  href: z.string(),
  spineIndex: z.number(),
  label: z.string().meta({
    description: "Resolved chapter title, or the href stem as a fallback.",
  }),
  title: z.string().nullable(),
  score: z.number().meta({ description: "The aligner's 0-100 chapter score." }),
  alignedSentenceCount: z.number(),
  chapterSentenceCount: z.number(),
  missing: z.number(),
  audio: z.array(ReportChapterAudioSchemaV2),
  audioSeconds: z.number(),
  durationSuspicious: z.boolean(),
  status: z.enum(["ok", "missing", "no-audio", "range"]),
  needsLook: z.boolean(),
  ignored: z.boolean(),
  firstMatch: SentenceContextSchemaV2,
  lastMatch: SentenceContextSchemaV2,
  transcriptionContext: TranscriptionContextSchemaV2.optional(),
  endTranscriptionContext: TranscriptionContextSchemaV2.optional(),
})

export const ReportUnalignedItemSchemaV2 = z.object({
  kind: z.literal("unaligned"),
  href: z.string(),
  spineIndex: z.number().nullable(),
  label: z.string(),
  reason: z.enum(["not-found", "too-short", "is-nav", "no-text"]),
  chapterSentenceCount: z.number().nullable(),
  preview: z.string().nullable(),
  inBody: z.boolean().meta({
    description:
      "The chapter sits between the first and last matched chapter of the spine.",
  }),
  hint: z
    .enum([
      "front-matter",
      "part-title",
      "promo",
      "after-last-match",
      "before-first-match",
    ])
    .nullable(),
  needsLook: z.boolean(),
  ignored: z.boolean(),
})

export const ReportSpineItemSchemaV2 = z.discriminatedUnion("kind", [
  ReportChapterItemSchemaV2,
  ReportUnalignedItemSchemaV2,
])

export const ReportStripFileSchemaV2 = z.object({
  name: z.string(),
  filepath: z.string(),
  duration: z.number().nullable(),
  placed: z.boolean(),
  ignored: z.boolean(),
  ranges: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      href: z.string(),
      label: z.string(),
      tone: ReportRangeToneSchemaV2,
    }),
  ),
  between: z.object({
    before: z.string().nullable(),
    after: z.string().nullable(),
  }),
})

export const AlignmentReportSummarySchemaV2 = z.object({
  grade: z.enum(ALIGNMENT_GRADES),
  band: z.number().meta({ description: "0 is the best band, 6 the worst." }),
  score: z.number().nullable(),
  sentencesAligned: z.number(),
  sentencesTotal: z.number(),
  audioPlacedSeconds: z.number(),
  audioTotalSeconds: z.number(),
  needsLook: z.number(),
  ignored: z.number(),
  notFoundBody: z.number(),
  noAudio: z.number(),
  looseAudio: z.number(),
  chapters: z.number(),
})

export const AlignmentReportViewSchemaV2 = z.object({
  bookUuid: uuidv4,
  bookTitle: z.string().nullable(),
  reportUuid: uuidv4,
  jobUuid: uuidv4.nullable(),
  createdAt: z.string(),
  summary: AlignmentReportSummarySchemaV2,
  items: z.array(ReportSpineItemSchemaV2),
  audioFiles: z.array(ReportStripFileSchemaV2),
})

export const AlignmentIgnoreSchemaV2 = z.object({
  ignored: z.boolean().optional(),
})

export const AlignmentOverridesSchemaV2 = z.object({
  chapters: z.record(z.string(), AlignmentIgnoreSchemaV2).optional(),
  unalignedChapters: z.record(z.string(), AlignmentIgnoreSchemaV2).optional(),
  audioFiles: z.record(z.string(), AlignmentIgnoreSchemaV2).optional(),
})
