import { type DisplayJob } from "@/database/jobs"
import {
  ACTIVE_JOB_STATUSES,
  type JobEvent,
  type JobStatus,
  TERMINAL_JOB_STATUSES,
} from "@/jobEvents"
import { type JobsQueryV2 } from "@/schemas/v2/job"
import { type UUID } from "@/uuid"

export type JobListFilter = JobsQueryV2

export type JobListPatch = "patched" | "refetch"

export function jobListStatuses(
  filter: JobListFilter | undefined,
): readonly JobStatus[] | undefined {
  if (filter?.statuses?.length) return filter.statuses
  if (filter?.type === "active") return ACTIVE_JOB_STATUSES
  if (filter?.type === "finished") return TERMINAL_JOB_STATUSES
  return undefined
}

export function jobMatchesFilter(
  job: DisplayJob,
  filter: JobListFilter | undefined,
): boolean {
  const statuses = jobListStatuses(filter)
  if (statuses && !statuses.includes(job.status)) return false
  if (filter?.bookUuid && job.bookUuid !== filter.bookUuid) return false
  if (filter?.search) {
    const title = job.bookTitle?.toLowerCase() ?? null
    if (title === null || !title.includes(filter.search.toLowerCase())) {
      return false
    }
  }
  return true
}

function compareNullable(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a < b ? -1 : 1
}

export function compareJobs(
  filter: JobListFilter | undefined,
): (a: DisplayJob, b: DisplayJob) => number {
  const direction = filter?.order === "desc" ? -1 : 1
  const sort = filter?.sort

  const primary = (a: DisplayJob, b: DisplayJob) => {
    switch (sort) {
      case "title":
        return direction * compareNullable(a.bookTitle, b.bookTitle)
      case "status":
        return direction * compareNullable(a.status, b.status)
      case "finishedAt":
        return direction * compareNullable(a.finishedAt, b.finishedAt)
      default:
        return a.position - b.position
    }
  }

  return (a, b) =>
    primary(a, b) ||
    compareNullable(a.createdAt, b.createdAt) ||
    compareNullable(a.uuid, b.uuid)
}

export function applyJobEvent(
  list: DisplayJob[],
  filter: JobListFilter | undefined,
  event: JobEvent,
): JobListPatch {
  const index = list.findIndex((job) => job.uuid === event.jobUuid)
  const limit = filter?.limit ?? null
  const wasFull = limit !== null && list.length >= limit

  if (event.type === "jobDeleted") {
    if (index < 0) return "patched"
    list.splice(index, 1)
    return wasFull ? "refetch" : "patched"
  }

  const job = event.payload
  const matches = jobMatchesFilter(job, filter)

  if (index >= 0) {
    if (!matches) {
      list.splice(index, 1)
      return wasFull ? "refetch" : "patched"
    }
    list[index] = job
    list.sort(compareJobs(filter))
    return "patched"
  }

  if (!matches) return "patched"
  if (filter?.offset) return "refetch"

  list.push(job)
  list.sort(compareJobs(filter))
  if (limit !== null && list.length > limit) list.length = limit
  return "patched"
}

export function applyJobPatch(
  list: DisplayJob[],
  filter: JobListFilter | undefined,
  jobUuid: UUID,
  patch: Partial<DisplayJob>,
): JobListPatch {
  const existing = list.find((job) => job.uuid === jobUuid)
  if (!existing) return "patched"
  return applyJobEvent(list, filter, {
    type: "jobUpdated",
    jobUuid,
    payload: { ...existing, ...patch },
  })
}

export function queueJobNext(
  list: Pick<DisplayJob, "uuid" | "status" | "position">[],
  jobUuid: UUID,
): UUID[] {
  const active = list
    .filter(
      (job) =>
        job.uuid === jobUuid ||
        (ACTIVE_JOB_STATUSES as readonly JobStatus[]).includes(job.status),
    )
    .sort((a, b) => a.position - b.position)
  const target = active.filter((job) => job.uuid === jobUuid)
  const running = active.filter(
    (job) => job.uuid !== jobUuid && job.status === "RUNNING",
  )
  const rest = active.filter(
    (job) => job.uuid !== jobUuid && job.status !== "RUNNING",
  )
  const ordered = [...running, ...target, ...rest]
  for (const [index, job] of ordered.entries()) {
    job.position = index
  }
  return ordered.map((job) => job.uuid)
}
