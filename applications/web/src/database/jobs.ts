import { type Selectable, sql } from "kysely"

import { JobEvents } from "@/jobEvents"
import { type AlignmentGrade } from "@/shelves"
import type { UUID } from "@/uuid"
import type { RestartMode } from "@/work/distributor"
import type { JobStats } from "@/work/jobStats"
import {
  type RunConfig,
  type RunConfigSummary,
  summarizeRunConfig,
} from "@/work/runConfig"

import { type Readaloud } from "./books"
import { db } from "./connection"
import { type DB } from "./schema"

export type JobType = "book_align"

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

type JobRow = Selectable<DB["job"]>

export type Job = JobRow

export type PublicJob = Omit<Job, "config"> & {
  config: RunConfigSummary | null
  bookTitle: string | null
  alignmentGrade: AlignmentGrade | null
  alignmentScore: number | null
}

export function toPublicJob(
  job: Job,
  bookTitle: string | null = null,
  alignment?: { grade: AlignmentGrade | null; score: number | null },
): PublicJob {
  return {
    ...job,
    config: summarizeRunConfig(job.config),
    bookTitle,
    alignmentGrade: alignment?.grade ?? null,
    alignmentScore: alignment?.score ?? null,
  }
}

export type NewJob = {
  type: JobType
  bookUuid: UUID
  restart: RestartMode
  config: RunConfig | null
  position: number
}

export type JobUpdate = Partial<{
  status: JobStatus
  stage: Readaloud["currentStage"] | null
  progress: number
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  position: number
  stats: JobStats
}>

function emit(type: "jobUpdated" | "jobCreated" | "jobDeleted", jobUuid: UUID) {
  JobEvents.emit("message", { type, jobUuid })
}

export async function createJob(job: NewJob): Promise<Job> {
  const row = await db
    .insertInto("job")
    .values({
      type: job.type,
      bookUuid: job.bookUuid,
      restart: job.restart || null,
      config: job.config ? JSON.stringify(job.config) : null,
      position: job.position,
      status: "QUEUED",
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  emit("jobCreated", row.uuid)
  return row
}

export async function getJob(uuid: UUID): Promise<Job | null> {
  const row = await db
    .selectFrom("job")
    .selectAll()
    .where("uuid", "=", uuid)
    .limit(1)
    .executeTakeFirst()

  return row ?? null
}

export async function getJobs(filter?: {
  statuses?: readonly JobStatus[]
}): Promise<Job[]> {
  let query = db.selectFrom("job").selectAll()
  if (filter?.statuses?.length) {
    query = query.where("status", "in", filter.statuses)
  }
  const rows = await query
    .orderBy("position", "asc")
    .orderBy("createdAt", "asc")
    .execute()

  return rows
}

export type JobSort = "finishedAt" | "title" | "status"

export async function getDisplayJobs(filter?: {
  statuses?: readonly JobStatus[]
  bookUuid?: UUID
  search?: string
  sort?: JobSort
  order?: "asc" | "desc"
  limit?: number
  offset?: number
}): Promise<PublicJob[]> {
  let query = db
    .selectFrom("job")
    .leftJoin("book", "book.uuid", "job.bookUuid")
    .selectAll("job")
    .select("book.title as bookTitle")
    .select((eb) => [
      eb
        .selectFrom("alignmentReport")
        .select("grade")
        .whereRef("alignmentReport.jobUuid", "=", "job.uuid")
        .orderBy("createdAt", "desc")
        .limit(1)
        .as("alignmentGrade"),
      eb
        .selectFrom("alignmentReport")
        .select("score")
        .whereRef("alignmentReport.jobUuid", "=", "job.uuid")
        .orderBy("createdAt", "desc")
        .limit(1)
        .as("alignmentScore"),
    ])

  if (filter?.statuses?.length) {
    query = query.where("job.status", "in", filter.statuses)
  }
  if (filter?.bookUuid) {
    query = query.where("job.bookUuid", "=", filter.bookUuid)
  }
  if (filter?.search) {
    query = query.where("book.title", "like", `%${filter.search}%`)
  }

  const order = filter?.order ?? "asc"
  if (filter?.sort === "title") {
    query = query.orderBy("book.title", order)
  } else if (filter?.sort === "status") {
    query = query.orderBy("job.status", order)
  } else if (filter?.sort === "finishedAt") {
    query = query.orderBy("job.finishedAt", order)
  } else {
    query = query
      .orderBy(
        sql<number>`case job.status when 'RUNNING' then 0 when 'PAUSED' then 1 else 2 end`,
      )
      .orderBy("job.position", "asc")
      .orderBy("job.createdAt", "asc")
  }

  const rows = await query
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .$if(!!filter?.limit, (qb) => qb.limit(filter!.limit!))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .$if(!!filter?.offset, (qb) => qb.offset(filter!.offset!))
    .execute()

  return rows.map(({ bookTitle, alignmentGrade, alignmentScore, ...row }) =>
    toPublicJob(row, bookTitle ?? null, {
      grade: alignmentGrade ?? null,
      score: alignmentScore ?? null,
    }),
  )
}

export async function getActiveJobForBook(bookUuid: UUID): Promise<Job | null> {
  const row = await db
    .selectFrom("job")
    .selectAll()
    .where("bookUuid", "=", bookUuid)
    .where("status", "in", ACTIVE_JOB_STATUSES)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst()
  return row ?? null
}

export async function updateJob(uuid: UUID, patch: JobUpdate): Promise<Job> {
  const { stats, ...rest } = patch

  const row = await db
    .updateTable("job")
    .set({
      ...rest,
      ...(stats !== undefined && { stats: JSON.stringify(stats) }),
    })
    .where("uuid", "=", uuid)
    .returningAll()
    .executeTakeFirstOrThrow()

  emit("jobUpdated", row.uuid)

  return row
}

export async function getNextJobPosition(): Promise<number> {
  const row = await db
    .selectFrom("job")
    .select("position")
    .where("status", "in", ACTIVE_JOB_STATUSES)
    .orderBy("position", "desc")
    .limit(1)
    .executeTakeFirst()
  return (row?.position ?? -1) + 1
}

export async function reorderQueuedJobs(orderedUuids: UUID[]): Promise<void> {
  await db.transaction().execute(async (tr) => {
    for (const [index, uuid] of orderedUuids.entries()) {
      await tr
        .updateTable("job")
        .set({ position: index })
        .where("uuid", "=", uuid)
        .where("status", "=", "QUEUED")
        .execute()
    }
  })
  for (const uuid of orderedUuids) emit("jobUpdated", uuid)
}

export async function getFinishedJobStats(
  limit = 100,
): Promise<{ config: RunConfig; restart: RestartMode; stats: JobStats }[]> {
  const rows = await db
    .selectFrom("job")
    .select(["config", "restart", "stats"])
    .where("status", "=", "DONE")
    .where("stats", "is not", null)
    .orderBy("finishedAt", "desc")
    .limit(limit)
    .execute()

  return rows
    .filter(
      (row): row is typeof row & { config: RunConfig; stats: JobStats } =>
        row.config !== null && row.stats !== null,
    )
    .map((row) => ({
      config: row.config,
      restart: row.restart ?? false,
      stats: row.stats,
    }))
}

export function nowTimestamp(): string {
  return new Date().toISOString().replace(/\.\d+/, "")
}
