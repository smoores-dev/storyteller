import { extname, join, resolve } from "node:path"
import { cwd } from "node:process"
import { MessageChannel } from "node:worker_threads"

import { AsyncMutex } from "@esfx/async-mutex"
import Piscina from "piscina"

import { pathBelongsTo } from "@/assets/library/scanner/folder"
import { filepathFolder, scan } from "@/assets/library/scanner/scan"
import {
  releasePrefixAfterSettle,
  suppressPrefix,
} from "@/assets/library/scanner/write-intent"
import { getReadaloudFilepath } from "@/assets/paths"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  type Readaloud,
  getBookOrThrow,
  updateBook,
} from "@/database/books"
import {
  ACTIVE_JOB_STATUSES,
  type Job,
  createJob,
  getActiveJobForBook,
  getJob,
  getJobs,
  getNextJobPosition,
  nowTimestamp,
  reorderActiveJobs,
  updateJob,
} from "@/database/jobs"
import { getSettings } from "@/database/settings"
import { env } from "@/env"
import { logger } from "@/logging"
import type { UUID } from "@/uuid"

import type { JobStats } from "./jobStats"
import { type RunConfig, buildRunConfig } from "./runConfig"
import { STAGE_ORDER } from "./stages"
import type processBook from "./worker"

export type RestartMode =
  | false
  | "full"
  | "transcode"
  | "transcription"
  | "sync"

const MAX_CONCURRENT = 1
const WORKER_STOP_GRACE_MS = 30_000

export type ControlMessage = { type: "abort" }

type AbortIntent = "cancel" | "pause" | "requeue"

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("onnxruntime-node")
} catch (err) {
  logger.error({ msg: "Failed to import onnx-runtime", err })
}

/**
 * Next.js app directory seems to have a bug where, in production,
 * a single module can be imported multiple times (breaking the module
 * cache) if it's depended on by different modules that end up in different
 * bundled chunks.
 *
 * This results in multiple instances of the module level values in this
 * module, all of which rely on being singletons to work correctly.
 */
declare global {
  // variables declared with const/let cannot be added to the global scope
  /* eslint-disable no-var */
  var jobControllers: Map<UUID, AbortController> | undefined
  var jobAbortIntents: Map<UUID, AbortIntent> | undefined
  var alignmentPiscina: Piscina | undefined
  /* eslint-enable no-var */
}

let controllers: Map<UUID, AbortController>
if (globalThis.jobControllers) {
  controllers = globalThis.jobControllers
} else {
  controllers = new Map()
  globalThis.jobControllers = controllers
}

let abortIntents: Map<UUID, AbortIntent>
if (globalThis.jobAbortIntents) {
  abortIntents = globalThis.jobAbortIntents
} else {
  abortIntents = new Map()
  globalThis.jobAbortIntents = abortIntents
}

const filename = join(cwd(), "work-dist", env.STORYTELLER_WORKER)

let alignmentPiscina: Piscina
if (globalThis.alignmentPiscina) {
  alignmentPiscina = globalThis.alignmentPiscina
} else {
  alignmentPiscina = new Piscina({
    filename,
    minThreads: 0,
    maxThreads: 1,
    idleTimeout: 30_000,
    // In dev, we don't bundle packages in the worker.
    // These flags allow us to import directly from the
    // source typescript files for our own packages (e.g. @storyteller-platform/epub)
    ...(env.NODE_ENV === "development" && {
      env: {
        ...process.env,
        NODE_OPTIONS:
          "--conditions=@storyteller-node --disable-warning=ExperimentalWarning --experimental-transform-types",
      },
    }),
  })
  globalThis.alignmentPiscina = alignmentPiscina
}

const pumpMutex = new AsyncMutex()

export async function enqueueBookAlign(
  bookUuid: UUID,
  restart: RestartMode,
  overrides?: Partial<RunConfig>,
): Promise<Job> {
  const existing = await getActiveJobForBook(bookUuid)
  if (existing) {
    return existing
  }

  const book = await getBookOrThrow(bookUuid)
  const settings = await getSettings()
  const config = buildRunConfig(settings, book.language ?? null, overrides)

  const effectiveRestart = clampRestart(restart, book)
  const startStage = getStartStage(effectiveRestart, book)
  const position = await getNextJobPosition()

  const job = await createJob({
    type: "book_align",
    bookUuid,
    restart: effectiveRestart,
    config,
    position,
  })

  await updateJob(job.uuid, { stage: startStage })

  await updateBook(bookUuid, null, {
    readaloud: {
      status: "QUEUED",
      currentStage: startStage,
      queuePosition: position,
      restartPending: effectiveRestart || null,
    },
  })

  void pump()
  return job
}

async function claimNextJob(): Promise<
  { job: Job; resumed: boolean } | undefined
> {
  await pumpMutex.lock()
  try {
    if (controllers.size >= MAX_CONCURRENT) return undefined

    const [next] = await getJobs({ statuses: ["QUEUED", "RUNNING"] })
    if (!next) return undefined

    const abortController = new AbortController()
    controllers.set(next.uuid, abortController)
    const job = await updateJob(next.uuid, {
      status: "RUNNING",
      startedAt: nowTimestamp(),
      error: null,
    })
    return { job, resumed: next.startedAt !== null }
  } finally {
    pumpMutex.unlock()
  }
}

export async function pump(): Promise<void> {
  const claimed = await claimNextJob()
  if (!claimed) return

  const { job, resumed } = claimed
  void runJob(job, resumed).finally(() => {
    controllers.delete(job.uuid)
    abortIntents.delete(job.uuid)
    void pump()
  })
}

async function runJob(job: Job, resumed: boolean): Promise<void> {
  if (!job.bookUuid) {
    logger.error(`Job ${job.uuid} is not a runnable book_align job`)
    await updateJob(job.uuid, { status: "ERROR", error: "invalid job" })
    return
  }

  const bookUuid = job.bookUuid
  const abortController = controllers.get(job.uuid)
  if (!abortController) return

  const book = await getBookOrThrow(bookUuid)

  const filePaths = [
    book.ebook?.filepath,
    book.audiobook?.filepath,
    book.readaloud?.filepath,
  ]
    .filter((filepath) => filepath != undefined)
    .map((filepath) => resolve(filepath))

  const dirs = filePaths.filter((dir) => !extname(dir))
  const realFilePaths = filePaths.filter(
    (path) => !dirs.some((dir) => pathBelongsTo(dir, path)),
  )
  const toSupress = [...dirs, ...realFilePaths]

  if (book.ebook?.filepath) {
    try {
      const settings = await getSettings()
      toSupress.push(getReadaloudFilepath(book, settings))
    } catch (err) {
      logger.warn({
        msg: "Failed to predict readaloud filepath for suppression",
        bookUuid,
        err,
      })
    }
  }

  const refreshSuppression = () => {
    for (const fp of toSupress) suppressPrefix(fp)
  }

  const { port1, port2 } = new MessageChannel()

  const terminate = new AbortController()
  let terminateTimer: NodeJS.Timeout | undefined
  abortController.signal.addEventListener(
    "abort",
    () => {
      port2.postMessage({ type: "abort" } satisfies ControlMessage)
      terminateTimer = setTimeout(() => {
        logger.warn(
          `Worker for job ${job.uuid} did not stop within ${WORKER_STOP_GRACE_MS}ms, terminating it`,
        )
        terminate.abort()
      }, WORKER_STOP_GRACE_MS)
    },
    { once: true },
  )

  port2.on(
    "message",
    async (message: {
      requestId: UUID
      update: BookUpdate | null
      relations: BookRelationsUpdate
    }) => {
      refreshSuppression()

      if (message.relations.readaloud?.filepath) {
        toSupress.push(message.relations.readaloud.filepath)
      }

      const updated = await updateBook(
        bookUuid,
        message.update,
        message.relations,
      )

      const readaloud = message.relations.readaloud
      if (readaloud) {
        await updateJob(job.uuid, {
          stage: readaloud.currentStage,
          progress: readaloud.stageProgress,
        })
      }

      port2.postMessage({ requestId: message.requestId, book: updated })
    },
  )

  refreshSuppression()

  try {
    const stats = (await alignmentPiscina.run(
      {
        jobUuid: job.uuid,
        bookUuid,
        restart: resumed ? false : job.restart ?? false,
        config: job.config,
        port: port1,
      } satisfies Parameters<typeof processBook>[0],
      { transferList: [port1], signal: terminate.signal },
    )) as JobStats | undefined

    const finished = await getBookOrThrow(bookUuid)

    if (finished.readaloud?.status === "ERROR") {
      logger.error(
        `Processing for "${finished.title}" (${bookUuid}) failed during ${finished.readaloud.currentStage}. See the error log above for details.`,
      )
      await updateJob(job.uuid, {
        status: "ERROR",
        finishedAt: nowTimestamp(),
        error: `failed during ${finished.readaloud.currentStage}`,
      })
      return
    }

    if (!finished.readaloud?.filepath) {
      throw new Error(
        `Processing completed for "${finished.title}" (${bookUuid}) but no aligned file was produced. This is likely a bug.`,
      )
    }

    await scan({
      source: "readaloud-creation",
      request: {
        kind: "candidates",
        candidates: [
          {
            filepath: finished.readaloud.filepath,
            format: "readaloud",
            existingBook: finished,
            folder: filepathFolder(finished.readaloud.filepath),
          },
        ],
      },
      options: { concurrency: 1 },
      signal: AbortSignal.timeout(10000),
    })

    await updateJob(job.uuid, {
      status: "DONE",
      progress: 1,
      finishedAt: nowTimestamp(),
      stats: stats ?? undefined,
    })
  } catch (err) {
    if (
      abortController.signal.aborted ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      const intent = abortIntents.get(job.uuid) ?? "cancel"
      const current = await getBookOrThrow(bookUuid)
      const stage = current.readaloud?.currentStage ?? "SPLIT_TRACKS"
      const requeued = intent === "requeue"
      const position = requeued
        ? (await getJob(job.uuid))?.position ?? job.position
        : null

      logger.info(`Processing for job ${job.uuid} ${intent}d by user`)

      await updateBook(bookUuid, null, {
        readaloud: {
          status: requeued ? "QUEUED" : "STOPPED",
          currentStage: stage,
          queuePosition: position,
          restartPending: null,
        },
      })

      await updateJob(job.uuid, {
        status:
          intent === "pause"
            ? "PAUSED"
            : requeued
              ? "QUEUED"
              : "CANCELED",
        stage,
        finishedAt: intent === "cancel" ? nowTimestamp() : null,
      })
      return
    }

    const current = await getBookOrThrow(bookUuid)
    await updateBook(bookUuid, null, {
      readaloud: {
        status: "ERROR",
        currentStage: current.readaloud?.currentStage ?? "SPLIT_TRACKS",
        queuePosition: null,
        restartPending: null,
      },
    })

    await updateJob(job.uuid, {
      status: "ERROR",
      finishedAt: nowTimestamp(),
      error: err instanceof Error ? err.message : String(err),
    })

    logger.error(`Processing for job ${job.uuid} failed unexpectedly`)
    logger.error(err)
  } finally {
    clearTimeout(terminateTimer)
    for (const fp of toSupress) releasePrefixAfterSettle(fp)
  }
}

export async function cancelJob(jobUuid: UUID): Promise<void> {
  const job = await getJob(jobUuid)
  if (!job) return

  const controller = controllers.get(jobUuid)
  if (controller) {
    abortIntents.set(jobUuid, "cancel")
    controller.abort()
    return
  }

  await updateJob(jobUuid, { status: "CANCELED", finishedAt: nowTimestamp() })
  if (job.bookUuid) {
    await updateBook(job.bookUuid, null, {
      readaloud: {
        status: "STOPPED",
        currentStage: job.stage ?? "SPLIT_TRACKS",
        queuePosition: null,
        restartPending: null,
      },
    })
  }
  void pump()
}

export async function pauseJob(jobUuid: UUID): Promise<void> {
  const job = await getJob(jobUuid)
  if (!job) return

  const controller = controllers.get(jobUuid)
  if (controller) {
    abortIntents.set(jobUuid, "pause")
    controller.abort()
    return
  }

  if (job.status === "QUEUED") {
    await updateJob(jobUuid, { status: "PAUSED" })
  }
}

export async function resumeJob(jobUuid: UUID): Promise<void> {
  const job = await getJob(jobUuid)
  if (!job || job.status !== "PAUSED") return

  const position = await getNextJobPosition()
  await updateJob(jobUuid, {
    status: "QUEUED",
    position,
    finishedAt: null,
  })
  if (job.bookUuid) {
    await updateBook(job.bookUuid, null, {
      readaloud: {
        status: "QUEUED",
        currentStage: job.stage ?? "SPLIT_TRACKS",
        queuePosition: position,
      },
    })
  }
  void pump()
}

export async function reorderJobs(orderedUuids: UUID[]): Promise<void> {
  const active = await getJobs({ statuses: ACTIVE_JOB_STATUSES })
  await reorderActiveJobs(orderedUuids)

  const running = active.find((job) => job.status === "RUNNING")
  if (!running) {
    void pump()
    return
  }

  const queued = new Set(
    active.filter((job) => job.status === "QUEUED").map((job) => job.uuid),
  )
  const ahead = orderedUuids.slice(0, orderedUuids.indexOf(running.uuid))
  if (!ahead.some((uuid) => queued.has(uuid))) return

  const controller = controllers.get(running.uuid)
  if (!controller) return

  abortIntents.set(running.uuid, "requeue")
  controller.abort()
}

export async function cancelProcessing(bookUuid: UUID): Promise<void> {
  const job = await getActiveJobForBook(bookUuid)
  if (job) await cancelJob(job.uuid)
}

export async function startProcessing(
  bookUuid: UUID,
  restart: RestartMode,
): Promise<void> {
  await enqueueBookAlign(bookUuid, restart)
}

function clampRestart(
  restart: RestartMode,
  book: BookWithRelations,
): RestartMode {
  if (restart === false || restart === "full" || restart === "transcode")
    return restart

  const bookStage = book.readaloud?.currentStage ?? "SPLIT_TRACKS"
  const targetStage: Readaloud["currentStage"] =
    restart === "transcription" ? "TRANSCRIBE_CHAPTERS" : "SYNC_CHAPTERS"

  if (STAGE_ORDER[targetStage] > STAGE_ORDER[bookStage]) return false

  return restart
}

function getStartStage(
  restart: RestartMode,
  book: BookWithRelations,
): Readaloud["currentStage"] {
  if (restart === "full" || restart === "transcode") return "SPLIT_TRACKS"
  if (restart === "transcription") return "TRANSCRIBE_CHAPTERS"
  if (restart === "sync") return "SYNC_CHAPTERS"
  return book.readaloud?.currentStage ?? "SPLIT_TRACKS"
}
