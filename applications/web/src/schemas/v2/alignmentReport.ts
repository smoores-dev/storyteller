import z from "zod"

import { ALIGNMENT_GRADES } from "@/fields"
import { JOB_STATUSES } from "@/jobEvents"
import { uuidv4 } from "@/schemas/uuid"
import { RunConfigSchema } from "@/work/runConfig"

export const SentenceContextSchemaV2 = z.object({
  prevSentence: z.string().nullable(),
  matchedSentence: z.string(),
  nextSentence: z.string().nullable(),
})

export const JUDGMENT_OPTIONS = ["approved", "excluded"] as const

export const JudgmentSchemaV2 = z.enum(JUDGMENT_OPTIONS)

export type Judgment = z.infer<typeof JudgmentSchemaV2>

export const ReportChapterAudioSchemaV2 = z.object({
  name: z.string().meta({ description: "The audio file's basename." }),
  start: z.number(),
  end: z.number(),
  duration: z.number(),
  excluded: z.boolean().meta({
    description: "The whole audio file is excluded from the audio score.",
  }),
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
  readHref: z.string().nullable().meta({
    description:
      "The reading order href to fetch the chapter text from the read endpoint.",
  }),
  confidence: z
    .number()
    .meta({ description: "The aligner's 0-100 chapter score." }),
  alignedSentenceCount: z.number(),
  chapterSentenceCount: z.number(),
  firstMatchedSentenceId: z.number(),
  lastMatchedSentenceId: z.number(),
  audioSeconds: z.number(),
  audio: z.array(ReportChapterAudioSchemaV2),
  judgment: JudgmentSchemaV2.nullable(),
  firstMatch: SentenceContextSchemaV2,
  lastMatch: SentenceContextSchemaV2,
})

export const ReportUnalignedItemSchemaV2 = z.object({
  kind: z.literal("unaligned"),
  href: z.string(),
  spineIndex: z.number().nullable(),
  label: z.string(),
  title: z.string().nullable(),
  reason: z.enum(["not-found", "too-short", "is-nav", "no-text"]),
  chapterSentenceCount: z.number().nullable(),
  preview: z.string().nullable(),
  judgment: JudgmentSchemaV2.nullable(),
})

export const ReportSpineItemSchemaV2 = z.discriminatedUnion("kind", [
  ReportChapterItemSchemaV2,
  ReportUnalignedItemSchemaV2,
])

export const ReportAudioChunkSchemaV2 = z.object({
  start: z.number(),
  end: z.number(),
  duration: z.number(),
  placed: z.boolean().meta({
    description:
      "The chunk belongs to a chapter that counts. Chunks of excluded chapters keep their href but are not placed.",
  }),
  href: z.string().nullable(),
  label: z.string().nullable(),
})

export const ReportAudioFileSchemaV2 = z.object({
  name: z.string().meta({ description: "The audio file's basename." }),
  duration: z.number(),
  excluded: z.boolean(),
  placedSeconds: z.number(),
  chunks: z.array(ReportAudioChunkSchemaV2),
})

export const AlignmentReportSummarySchemaV2 = z.object({
  grade: z.enum(ALIGNMENT_GRADES),
  band: z.number().meta({ description: "0 is the best band, 7 the worst." }),
  score: z.number().nullable().meta({
    description:
      "0-100. Seventy percent sentences aligned, thirty percent audio placed. Drives the grade.",
  }),
  confidence: z.number().nullable().meta({
    description: "0-100 aligner confidence, weighted by sentence count.",
  }),
  sentencesAligned: z.number(),
  sentencesTotal: z.number(),
  audioPlacedSeconds: z.number(),
  audioTotalSeconds: z.number(),
  chapters: z.number(),
  approved: z.number(),
  excluded: z.number(),
  noAudio: z.number().meta({
    description: "Chapters that matched text but were given no audio.",
  }),
  looseAudio: z.number().meta({
    description: "Audio files with unplaced stretches that still count.",
  }),
  looseSeconds: z.number(),
})

export const AlignmentReportJobSchemaV2 = z.object({
  uuid: uuidv4,
  status: z.enum(JOB_STATUSES),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  runSeconds: z.number().nullable().meta({
    description: "Wall clock time the job took, when it finished.",
  }),
  config: RunConfigSchema.pick({
    aligner: true,
    ctcEngine: true,
    transcriptionEngine: true,
    whisperModel: true,
    language: true,
  }).nullable(),
})

export const AlignmentReportViewSchemaV2 = z.object({
  bookUuid: uuidv4,
  bookTitle: z.string().nullable(),
  reportUuid: uuidv4,
  jobUuid: uuidv4.nullable(),
  job: AlignmentReportJobSchemaV2.nullable().meta({
    description: "The job that produced this report, when it still exists.",
  }),
  createdAt: z.string(),
  summary: AlignmentReportSummarySchemaV2,
  items: z.array(ReportSpineItemSchemaV2),
  audioFiles: z.array(ReportAudioFileSchemaV2),
})

export const AlignmentChapterOverrideSchemaV2 = z.object({
  judgment: JudgmentSchemaV2.nullable().optional(),
  ignored: z.boolean().optional().meta({
    description: "Legacy flag, read as an excluded judgment.",
  }),
})

export const AlignmentAudioOverrideSchemaV2 = z.object({
  excluded: z.boolean().optional(),
  ignored: z.boolean().optional().meta({
    description: "Legacy flag, read as excluded.",
  }),
})

export const AlignmentOverridesSchemaV2 = z.object({
  chapters: z.record(z.string(), AlignmentChapterOverrideSchemaV2).optional(),
  unalignedChapters: z
    .record(z.string(), AlignmentChapterOverrideSchemaV2)
    .optional(),
  audioFiles: z.record(z.string(), AlignmentAudioOverrideSchemaV2).optional(),
})
