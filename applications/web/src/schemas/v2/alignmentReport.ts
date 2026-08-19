import z from "zod"

import { ALIGNMENT_GRADES } from "@/fields"
import { uuidv4 } from "@/schemas/uuid"

export const ReportAudioFileSchemaV2 = z.object({
  filepath: z.string(),
  title: z.string().nullable(),
  duration: z.number().nullable(),
  start: z.number(),
  end: z.number(),
})

export const ReportFlagSchemaV2 = z.object({
  label: z.string(),
  tone: z.enum(["poor", "moderate", "good", "info"]),
})

export const SentenceContextSchemaV2 = z.object({
  prevSentence: z.string().nullable(),
  matchedSentence: z.string(),
  nextSentence: z.string().nullable(),
})

export const ReportChapterRowSchemaV2 = z.object({
  href: z.string(),
  label: z.string().meta({
    description:
      "Resolved chapter title, or a prefix-stripped filename fallback.",
  }),
  title: z.string().nullable(),
  audioFiles: z.array(ReportAudioFileSchemaV2),
  chapterSentenceCount: z.number(),
  alignedSentenceCount: z.number(),
  coverage: z.number().nullable().meta({
    description:
      "aligned / total, 0..1; null when the chapter has no sentence data.",
  }),
  delta: z.number().meta({
    description: "Unmatched sentence count and its share of the chapter.",
  }),
  deltaPct: z.number(),
  flagged: z.boolean(),
  flags: z.array(ReportFlagSchemaV2),
  firstMatchedSentenceId: z.number(),
  lastMatchedSentenceId: z.number(),
  firstMatchedSentenceContext: SentenceContextSchemaV2,
  lastMatchedSentenceContext: SentenceContextSchemaV2,
  transcriptionContext: z.object({
    before: z.string(),
    after: z.string(),
  }),
  endTranscriptionContext: z.object({
    before: z.string(),
    after: z.string(),
  }),
  markedOk: z.boolean().meta({
    description: "This chapter is fine as-is.",
  }),
  excludedFromScore: z
    .boolean()
    .meta({ description: "Left out of th escore/grade math." }),
})

export const ReportUnalignedChapterSchemaV2 = z.object({
  href: z.string(),
  label: z.string(),
  reason: z.string(),
  preview: z.string().nullable(),
  intended: z.boolean(),
})

export const ReportUnalignedAudioSchemaV2 = z.object({
  filepath: z.string(),
  title: z.string().nullable(),
  duration: z.number().nullable(),
  transcription: z.string().nullable(),
  excluded: z.boolean(),
})

export const AlignmentReportViewSchemaV2 = z.object({
  bookUuid: uuidv4,
  bookTitle: z.string().nullable(),
  reportUuid: uuidv4,
  jobUuid: uuidv4.nullable(),
  createdAt: z.string(),
  summary: z.object({
    grade: z.enum(ALIGNMENT_GRADES),
    score: z.number().nullable(),
    chapters: z.number(),
    missingSentences: z.number(),
    mutedChapters: z.number(),
    failedChapters: z.number(),
    unalignedAudio: z.number(),
  }),
  totalAudioDuration: z.number(),
  alignedAudioDuration: z.number(),
  totalSentences: z.number(),
  alignedSentences: z.number(),
  significantChapters: z.number(),
  chapters: z.array(ReportChapterRowSchemaV2),
  unalignedChapters: z.array(ReportUnalignedChapterSchemaV2),
  unalignedAudioFiles: z.array(ReportUnalignedAudioSchemaV2),
})

export const AlignmentChapterOverrideSchemaV2 = z.object({
  excludeFromScore: z.boolean().optional(),
  markedOk: z.boolean().optional(),
})

export const AlignmentOverridesSchemaV2 = z.object({
  chapters: z.record(z.string(), AlignmentChapterOverrideSchemaV2),
  unalignedChapters: z
    .record(z.string(), z.object({ intended: z.boolean().optional() }))
    .optional(),
  audioFiles: z
    .record(z.string(), z.object({ excluded: z.boolean().optional() }))
    .optional(),
})
