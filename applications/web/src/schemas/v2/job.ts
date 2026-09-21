import z from "zod"

import { ALIGNMENT_GRADES } from "@/fields"
import { JOB_SORT_OPTIONS, JOB_STATUSES } from "@/jobEvents"
import { uuidv4 } from "@/schemas/uuid"
import { RunConfigSchema } from "@/work/runConfig"

export const JOB_LIST_TYPES = ["active", "finished", "all"] as const
export type JobListType = (typeof JOB_LIST_TYPES)[number]

export const JobsQuerySchemaV2 = z.object({
  type: z.enum(JOB_LIST_TYPES).optional().meta({
    description:
      "Shorthand for a status set. `active` is queued, running and paused, `finished` is done, error and canceled. An explicit `statuses` list takes precedence.",
  }),
  bookUuid: uuidv4.optional().meta({
    description: "Only jobs for this book.",
  }),
  search: z.string().min(1).optional().meta({
    description: "Case-insensitive substring match on the book title.",
  }),
  statuses: z.array(z.enum(JOB_STATUSES)).min(1).optional(),
  sort: z.enum(JOB_SORT_OPTIONS).optional().meta({
    description:
      "Without a sort, jobs come back in queue order (position, then creation time).",
  }),
  order: z.enum(["asc", "desc"]).optional().meta({
    description: "Direction for `sort`. Defaults to ascending.",
  }),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type JobsQueryV2 = z.output<typeof JobsQuerySchemaV2>

export const JobsReorderRequestSchemaV2 = z.object({
  order: z.array(uuidv4).min(1).meta({
    description: "Every active job, in the order it should run.",
  }),
})

export const JobActionRequestSchemaV2 = z.object({
  action: z.enum(["pause", "resume"]),
})

export const JobStageSchemaV2 = z.enum([
  "SPLIT_TRACKS",
  "TRANSCRIBE_CHAPTERS",
  "SYNC_CHAPTERS",
])

export const JobSchemaV2 = z.object({
  uuid: uuidv4,
  type: z.enum(["book_align"]),
  bookUuid: z.nullable(uuidv4),
  bookTitle: z.nullable(z.string()),
  status: z.enum(JOB_STATUSES),
  stage: z.nullable(JobStageSchemaV2),
  progress: z.number().min(0).max(1).meta({
    description: "Progress within the current stage.",
  }),
  position: z.int().meta({
    description: "Queue position. Lower runs first.",
  }),
  restart: z.nullable(z.enum(["full", "transcode", "transcription", "sync"])),
  error: z.nullable(z.string()),
  startedAt: z.nullable(z.string()),
  finishedAt: z.nullable(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  config: z.nullable(
    RunConfigSchema.pick({
      aligner: true,
      ctcEngine: true,
      transcriptionEngine: true,
      whisperModel: true,
      language: true,
      codec: true,
      bitrate: true,
      maxTrackLength: true,
    }),
  ),
  stats: z.nullable(z.unknown()),
  alignmentGrade: z.nullable(z.enum(ALIGNMENT_GRADES)),
  alignmentScore: z.nullable(z.number()),
})
