import { type Selectable } from "kysely"

import {
  ACTIVE_JOB_STATUSES,
  type JobEvent,
  JobEvents,
  type JobSort,
  type JobStatus,
} from "@/jobEvents"
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

type JobRow = Selectable<DB["job"]>

export type Job = JobRow

export type DisplayJob = Omit<Job, "config"> & {
  config: RunConfigSummary | null
  bookTitle: string | null
  alignmentGrade: AlignmentGrade | null
  alignmentScore: number | null
}

export function toDisplayJob(
  job: Job,
  bookTitle: string | null = null,
  alignment?: { grade: AlignmentGrade | null; score: number | null },
): DisplayJob {
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

function emit(event: JobEvent) {
  JobEvents.emit("message", event)
}

export async function createJob(job: NewJob): Promise<DisplayJob> {
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
    .returning("uuid")
    .executeTakeFirstOrThrow()

  const createdJob = await getDisplayJob(row.uuid)
  if (!createdJob) {
    throw new Error("Job not found")
  }
  emit({ type: "jobCreated", jobUuid: row.uuid, payload: createdJob })
  return createdJob
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

function getDisplayJobBase() {
  return db
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
}

export async function getDisplayJob(uuid: UUID): Promise<DisplayJob | null> {
  const row = await getDisplayJobBase()
    .where("job.uuid", "=", uuid)
    .executeTakeFirst()
  if (!row) {
    return null
  }
  return toDisplayJob(row)
}

export async function getDisplayJobs(filter?: {
  statuses?: readonly JobStatus[]
  bookUuid?: UUID
  search?: string
  sort?: JobSort
  order?: "asc" | "desc"
  limit?: number
  offset?: number
}): Promise<DisplayJob[]> {
  let query = getDisplayJobBase()

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
    query = query.orderBy("job.position", "asc").orderBy("job.createdAt", "asc")
  }

  const rows = await query
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .$if(!!filter?.limit, (qb) => qb.limit(filter!.limit!))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .$if(!!filter?.offset, (qb) => qb.offset(filter!.offset!))
    .execute()

  return rows.map(({ bookTitle, alignmentGrade, alignmentScore, ...row }) =>
    toDisplayJob(row, bookTitle ?? null, {
      grade: alignmentGrade ?? null,
      score: alignmentScore ?? null,
    }),
  )
}

export async function getActiveJobForBook(
  bookUuid: UUID,
): Promise<DisplayJob | null> {
  const row = await db
    .selectFrom("job")
    .select("uuid")
    .where("bookUuid", "=", bookUuid)
    .where("status", "in", ACTIVE_JOB_STATUSES)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst()

  if (!row) {
    return null
  }

  const job = await getDisplayJob(row.uuid)
  if (!job) {
    return null
  }

  return job
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

  emit({ type: "jobUpdated", jobUuid: row.uuid, payload: row })

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

export async function reorderActiveJobs(orderedUuids: UUID[]): Promise<void> {
  await db.transaction().execute(async (tr) => {
    for (const [index, uuid] of orderedUuids.entries()) {
      await tr
        .updateTable("job")
        .set({ position: index })
        .where("uuid", "=", uuid)
        .where("status", "in", ACTIVE_JOB_STATUSES)
        .execute()
    }
  })
  for (const [index, uuid] of orderedUuids.entries()) {
    emit({ type: "jobUpdated", jobUuid: uuid, payload: { position: index } })
  }
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
