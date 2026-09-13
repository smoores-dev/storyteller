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

export const JUDGMENT_OPTIONS = ["approved", "excluded", "included"] as const

export const CHAPTER_DECISIONS = JUDGMENT_OPTIONS

export const JudgmentSchemaV2 = z.enum(JUDGMENT_OPTIONS).meta({
  description:
    "The user's decision for a chapter. Excluded chapters are skipped by the aligner and left out of the score. Included chapters are aligned even when a rule would skip them. Approved chapters are included and their aligner score is trusted.",
})

export type Judgment = z.infer<typeof JudgmentSchemaV2>

export const SPINE_STATUSES = [
  "aligned",
  "not-found",
  "too-short",
  "excluded",
  "audio-only",
] as const

export const SpineStatusSchemaV2 = z.enum(SPINE_STATUSES)

export const EXCLUSION_SOURCES = [
  "linear",
  "nav",
  "media-type",
  "landmark",
  "content-type",
  "guide",
  "filename",
  "no-text",
] as const

export const EXCLUSION_VERDICTS = ["exclude", "review", "include"] as const

export const SPINE_ZONES = ["front", "body", "back"] as const

export const ExclusionSignalSchemaV2 = z.object({
  source: z.enum(EXCLUSION_SOURCES).meta({
    description: "Where the evidence came from, in order of precedence.",
  }),
  value: z.string().meta({
    description:
      "The matched value, such as the landmark type or the filename token.",
  }),
  verdict: z.enum(EXCLUSION_VERDICTS),
  division: z.boolean().optional().meta({
    description:
      "True for the blanket frontmatter, bodymatter and backmatter types, which rank below every other signal.",
  }),
})

export const ReportClassificationSchemaV2 = z.object({
  zone: z.enum(SPINE_ZONES).meta({
    description: "Front is the first 15% of the spine, back the last 15%.",
  }),
  verdict: z.enum(EXCLUSION_VERDICTS).meta({
    description:
      "Exclude means a rule marked it as not narrated. Review means it is aligned but deserves a listen. Include is the default.",
  }),
  decidedBy: ExclusionSignalSchemaV2.nullable(),
  signals: z.array(ExclusionSignalSchemaV2).meta({
    description: "Every signal collected, including the ones that lost.",
  }),
})

export const AudioExclusionSchemaV2 = z.object({
  track: z.string().meta({ description: "The transcoded track's file name." }),
  start: z.number().nullable().meta({
    description: "Seconds into the track. Null means from the start.",
  }),
  end: z.number().nullable().meta({
    description: "Seconds into the track. Null means to the end.",
  }),
})

export const AlignmentDecisionsSchemaV2 = z.object({
  chapters: z.record(z.string(), JudgmentSchemaV2).meta({
    description: "Keyed by spine item href.",
  }),
  audio: z.array(AudioExclusionSchemaV2).meta({
    description:
      "Audio ranges the aligner masks and the score leaves out. A range with null start and end excludes the whole track.",
  }),
})

export type AlignmentDecisionsV2 = z.infer<typeof AlignmentDecisionsSchemaV2>

export const ReportSpineItemSchemaV2 = z.object({
  index: z.number().meta({ description: "Position in the EPUB spine." }),
  href: z.string(),
  title: z.string().nullable().meta({
    description: "Chapter title from the table of contents, when known.",
  }),
  status: SpineStatusSchemaV2,
  classification: ReportClassificationSchemaV2.nullable().meta({
    description: "What the exclusion rules made of this item during the run.",
  }),
  decision: JudgmentSchemaV2.nullable().meta({
    description: "The user's decision the run was made with.",
  }),
  sentenceCount: z.number(),
  matchedSentenceCount: z.number().meta({
    description: "Sentences the aligner placed directly.",
  }),
  interpolatedSentenceCount: z.number().meta({
    description: "Sentences placed by interpolation between matches.",
  }),
  droppedSentenceCount: z.number().meta({
    description: "Sentences the aligner determined are not read in the audio.",
  }),
  looseSeconds: z.number().meta({
    description:
      "Seconds of audio attached to this item as audio-only media overlay entries.",
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
  looseSeconds: z.number(),
  excluded: z
    .array(z.object({ start: z.number(), end: z.number() }))
    .meta({ description: "Ranges the run masked, in seconds." }),
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
  z.object({
    ...SpanTextShape,
    state: z.literal("dropped"),
    audio: z.null(),
  }),
])

export const ReportHoleSchemaV2 = z.object({
  spine: z.number().meta({
    description: "The spine item whose media overlay carries this audio.",
  }),
  sentence: z.number().meta({
    description: "The sentence the audio-only entry is attached to.",
  }),
  position: z.enum(["before", "after"]),
  audio: SpanAudioSchemaV2,
})

export const ReportTotalsSchemaV2 = z.object({
  sentences: z.number(),
  matchedSentences: z.number(),
  interpolatedSentences: z.number(),
  unmatchedSentences: z.number(),
  droppedSentences: z.number(),
  seconds: z.number(),
  matchedSeconds: z.number(),
  interpolatedSeconds: z.number(),
  looseSeconds: z.number(),
  spine: z.record(SpineStatusSchemaV2, z.number()),
  tracks: z.number(),
  unalignedTracks: z.number(),
})

export const AlignmentReportSchemaV2 = z.object({
  version: z.literal(4),
  aligner: z.enum(["ctc", "classic"]),
  autoExclude: z.boolean().meta({
    description: "Whether the run applied the exclusion rules.",
  }),
  spine: z.array(ReportSpineItemSchemaV2),
  tracks: z.array(ReportTrackSchemaV2),
  spans: z.array(ReportSpanSchemaV2),
  holes: z.array(ReportHoleSchemaV2).meta({
    description:
      "Audio with no text, written into the media overlays as audio-only entries.",
  }),
  totals: ReportTotalsSchemaV2,
})

export const AlignmentReportSummarySchemaV2 = z.object({
  grade: z.enum(ALIGNMENT_GRADES),
  band: z.number().meta({ description: "0 is the best band, 5 the worst." }),
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
  excluded: z.number().meta({
    description: "Chapters excluded by the user's decision.",
  }),
  excludedByRule: z.number().meta({
    description: "Spine items the run skipped because a rule matched.",
  }),
  review: z.number().meta({
    description:
      "Aligned chapters the rules flagged as only sometimes narrated, with no decision yet.",
  }),
  pending: z.number().meta({
    description:
      "Chapters whose decision changed since the run. They only take effect on the next alignment.",
  }),
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
  judgment: JudgmentSchemaV2.nullable().meta({
    description: "The user's current decision.",
  }),
  pending: z.boolean().meta({
    description:
      "The current decision would change whether this item is aligned. It takes effect on the next alignment.",
  }),
})

export const ViewTrackSchemaV2 = ReportTrackSchemaV2.extend({
  playback: z.enum(["readaloud", "original"]).nullable().meta({
    description:
      "Where this track can be played from. The readaloud file holds the exact audio of the newest report but only tracks that were written into it, otherwise the original audiobook file when the report knows where the track came from, or null when neither is available.",
  }),
  readaloudHref: z.string().nullable().meta({
    description:
      "The track's href inside the readaloud file, when playback is readaloud.",
  }),
  excluded: z.boolean().meta({
    description: "The whole track is excluded from the audio score.",
  }),
  excludedRanges: z
    .array(z.object({ start: z.number(), end: z.number() }))
    .meta({
      description:
        "Ranges currently excluded from the audio score, in seconds, merged.",
    }),
})

export const AlignmentReportPreviousSchemaV2 = z.object({
  reportUuid: uuidv4,
  createdAt: z.string(),
  hasReport: z.boolean().meta({
    description:
      "False once the report payload was pruned. Only the stored summary remains, so it can no longer be opened.",
  }),
  job: AlignmentReportJobSchemaV2.nullable(),
  grade: z.enum(ALIGNMENT_GRADES),
  score: z.number().nullable(),
  confidence: z.number().nullable(),
  sentenceCoverage: z.number().nullable(),
  audioCoverage: z.number().nullable(),
  chapters: z.number().nullable(),
  failedChapters: z.number().nullable(),
  unalignedAudio: z.number().nullable(),
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
  latest: z.boolean().meta({
    description: "Whether this is the newest report for the book.",
  }),
  audioSource: z.enum(["readaloud", "original", "none"]).meta({
    description:
      "Where the report's audio can be played from. The readaloud file holds the exact tracks of the newest report, older reports fall back to the original audiobook files when the report knows where each track came from.",
  }),
  previous: AlignmentReportPreviousSchemaV2.nullable().meta({
    description: "The stored summary of the report that came before this one.",
  }),
  aligner: z.enum(["ctc", "classic"]),
  autoExclude: z.boolean(),
  decisions: AlignmentDecisionsSchemaV2,
  summary: AlignmentReportSummarySchemaV2,
  items: z.array(ViewSpineItemSchemaV2),
  tracks: z.array(ViewTrackSchemaV2),
  spans: z.array(ReportSpanSchemaV2),
  holes: z.array(ReportHoleSchemaV2).meta({
    description:
      "Audio with no text, written into the media overlays as audio-only entries.",
  }),
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
