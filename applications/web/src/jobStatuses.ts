export const JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "DONE",
  "ERROR",
  "CANCELED",
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export const ACTIVE_JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "PAUSED",
] as const satisfies JobStatus[]
export const TERMINAL_JOB_STATUSES = [
  "DONE",
  "ERROR",
  "CANCELED",
] as const satisfies JobStatus[]

export const JOB_SORT_OPTIONS = ["finishedAt", "title", "status"] as const
export type JobSort = (typeof JOB_SORT_OPTIONS)[number]
