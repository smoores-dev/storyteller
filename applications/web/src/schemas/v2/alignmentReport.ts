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

export const SPINE_STATUSES = [
  "aligned",
  "not-found",
  "too-short",
  "is-nav",
  "no-text",
] as const

export const SpineStatusSchemaV2 = z.enum(SPINE_STATUSES)

export const ReportSpineItemSchemaV2 = z.object({
  index: z.number().meta({ description: "Position in the EPUB spine." }),
  href: z.string(),
  title: z.string().nullable().meta({
    description: "Chapter title from the table of contents, when known.",
  }),
  status: SpineStatusSchemaV2,
  sentenceCount: z.number(),
  matchedSentenceCount: z.number().meta({
    description: "Sentences the aligner placed directly.",
  }),
  interpolatedSentenceCount: z.number().meta({
    description: "Sentences placed by interpolation between matches.",
  }),
  matchedSeconds: z.number(),
  interpolatedSeconds: z.number(),
  score: z.number().nullable().meta({
    description: "0-100 mean aligner score over the matched sentences.",
  }),
  firstMatch: SentenceContextSchemaV2.nullable(),
  lastMatch: SentenceContextSchemaV2.nullable(),
  preview: z.string().nullable(),
})

export const ReportTrackSourceSchemaV2 = z.object({
  file: z.string().meta({
    description: "Path of the original audio file, relative to the audiobook.",
  }),
  start: z.number(),
  end: z.number(),
  title: z.string().nullable(),
})

export const ReportTrackSchemaV2 = z.object({
  index: z.number(),
  name: z.string().meta({ description: "The transcoded track's file name." }),
  duration: z.number(),
  offset: z.number().meta({
    description: "Seconds from the start of the whole audiobook.",
  }),
  matchedSeconds: z.number(),
  interpolatedSeconds: z.number(),
  source: ReportTrackSourceSchemaV2.nullable(),
})

export const SpanAudioSchemaV2 = z.object({
  track: z.number(),
  start: z.number(),
  end: z.number(),
})

const SpanTextShape = {
  spine: z.number(),
  firstSentence: z.number(),
  lastSentence: z.number(),
}

export const ReportSpanSchemaV2 = z.discriminatedUnion("state", [
  z.object({
    ...SpanTextShape,
    state: z.literal("aligned"),
    audio: SpanAudioSchemaV2,
    score: z.number().nullable(),
  }),
  z.object({
    ...SpanTextShape,
    state: z.literal("interpolated"),
    audio: SpanAudioSchemaV2,
  }),
  z.object({
    ...SpanTextShape,
    state: z.literal("unmatched"),
    audio: z.null(),
  }),
])

export const ReportTotalsSchemaV2 = z.object({
  sentences: z.number(),
  matchedSentences: z.number(),
  interpolatedSentences: z.number(),
  unmatchedSentences: z.number(),
  seconds: z.number(),
  matchedSeconds: z.number(),
  interpolatedSeconds: z.number(),
  spine: z.record(SpineStatusSchemaV2, z.number()),
  tracks: z.number(),
  unalignedTracks: z.number(),
})

export const AlignmentReportSchemaV2 = z.object({
  version: z.literal(3),
  aligner: z.enum(["ctc", "classic"]),
  spine: z.array(ReportSpineItemSchemaV2),
  tracks: z.array(ReportTrackSchemaV2),
  spans: z.array(ReportSpanSchemaV2),
  totals: ReportTotalsSchemaV2,
})

export const AlignmentReportSummarySchemaV2 = z.object({
  grade: z.enum(ALIGNMENT_GRADES),
  band: z.number().meta({ description: "0 is the best band, 7 the worst." }),
  score: z.number().nullable().meta({
    description:
      "0-100. Seventy percent sentences matched, thirty percent audio placed. Determines the grade.",
  }),
  confidence: z.number().nullable().meta({
    description: "0-100 aligner score, weighted by matched sentence count.",
  }),
  sentenceCoverage: z.number().nullable().meta({
    description: "0-100 percent of counted sentences that were matched.",
  }),
  audioCoverage: z.number().nullable().meta({
    description: "0-100 percent of counted audio that was placed.",
  }),
  sentencesMatched: z.number().meta({
    description:
      "Matched sentences plus single interpolated sentences sitting between matches.",
  }),
  sentencesTotal: z.number(),
  audioPlacedSeconds: z.number(),
  audioTotalSeconds: z.number(),
  chapters: z.number().meta({ description: "Spine items with text." }),
  approved: z.number(),
  excluded: z.number(),
  failed: z.number().meta({
    description: "Counted chapters with text that matched nothing.",
  }),
  looseAudio: z.number().meta({
    description: "Counted tracks with unplaced stretches.",
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
    codec: true,
    bitrate: true,
    maxTrackLength: true,
  }).nullable(),
})

export const ViewSpineItemSchemaV2 = ReportSpineItemSchemaV2.extend({
  label: z.string().meta({
    description: "Resolved chapter title, or the href stem as a fallback.",
  }),
  readHref: z.string().nullable().meta({
    description:
      "The reading order href to fetch the chapter text from the read endpoint.",
  }),
  judgment: JudgmentSchemaV2.nullable(),
})

export const ViewTrackSchemaV2 = ReportTrackSchemaV2.extend({
  excluded: z.boolean().meta({
    description: "The whole track is excluded from the audio score.",
  }),
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
  aligner: z.enum(["ctc", "classic"]),
  summary: AlignmentReportSummarySchemaV2,
  items: z.array(ViewSpineItemSchemaV2),
  tracks: z.array(ViewTrackSchemaV2),
  spans: z.array(ReportSpanSchemaV2),
  totals: ReportTotalsSchemaV2,
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
