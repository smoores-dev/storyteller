import { join } from "node:path"
import { cwd } from "node:process"
import { MessageChannel } from "node:worker_threads"

import { AsyncMutex } from "@esfx/async-mutex"
import Piscina from "piscina"

import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  type Readaloud,
  getBookOrThrow,
  getNextQueuePosition,
  updateBook,
} from "@/database/books"
import { env } from "@/env"
import { logger } from "@/logging"
import type { UUID } from "@/uuid"

import { STAGE_ORDER } from "./stages"
import type processBook from "./worker"

export type RestartMode = false | "full" | "transcription" | "sync"

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
  var controllers: Map<UUID, AbortController> | undefined
  var alignmentPiscina: Piscina | undefined
  /* eslint-enable no-var */
}

let controllers: Map<UUID, AbortController>
if (globalThis.controllers) {
  controllers = globalThis.controllers
} else {
  controllers = new Map()
  globalThis.controllers = controllers
}

const filename = join(cwd(), "work-dist", env.STORYTELLER_WORKER)

let alignmentPiscina: Piscina
if (globalThis.alignmentPiscina) {
  alignmentPiscina = globalThis.alignmentPiscina
} else {
  alignmentPiscina = new Piscina({
    filename,
    maxThreads: 1,
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

export function cancelProcessing(bookUuid: UUID) {
  const abortController = controllers.get(bookUuid)
  if (!abortController) {
    return
  }

  abortController.abort()
  if (controllers.has(bookUuid)) controllers.delete(bookUuid)
}

const mutex = new AsyncMutex()

export async function startProcessing(bookUuid: UUID, restart: RestartMode) {
  if (controllers.has(bookUuid)) return

  await mutex.lock()
  let book: BookWithRelations
  let abortController: AbortController
  let effectiveRestart: RestartMode = false
  try {
    const position = await getNextQueuePosition()
    book = await getBookOrThrow(bookUuid)

    effectiveRestart = clampRestart(restart, book)
    const startStage = getStartStage(effectiveRestart, book)

    await updateBook(bookUuid, null, {
      readaloud: {
        status: "QUEUED",
        currentStage: startStage,
        queuePosition: position,
        restartPending: effectiveRestart || null,
      },
    })

    abortController = new AbortController()
  } finally {
    mutex.unlock()
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!book || !abortController) {
    logger.error("Failed to enqueue book for processing")
    return
  }

  controllers.set(bookUuid, abortController)

  const { port1, port2 } = new MessageChannel()

  port2.on(
    "message",
    async (message: {
      requestId: UUID
      update: BookUpdate | null
      relations: BookRelationsUpdate
    }) => {
      const updated = await updateBook(
        bookUuid,
        message.update,
        message.relations,
      )
      port2.postMessage({ requestId: message.requestId, book: updated })
    },
  )

  try {
    await alignmentPiscina.run(
      { bookUuid, restart: effectiveRestart, port: port1 } satisfies Parameters<
        typeof processBook
      >[0],
      { transferList: [port1], signal: abortController.signal },
    )
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.info(`Processing for book ${bookUuid} aborted by user`)

      const book = await getBookOrThrow(bookUuid)
      await updateBook(bookUuid, null, {
        readaloud: {
          status: "STOPPED",
          currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
          queuePosition: null,
          restartPending: null,
        },
      })
      return
    }

    const book = await getBookOrThrow(bookUuid)
    await updateBook(bookUuid, null, {
      readaloud: {
        status: "ERROR",
        currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
        queuePosition: null,
        restartPending: null,
      },
    })

    logger.error(`Processing for book ${bookUuid} failed unexpectedly`)
    logger.error(err)
  } finally {
    if (controllers.has(bookUuid)) controllers.delete(bookUuid)
  }
}

// clamp the requested restart to the book's actual progress so we never
// skip ahead past stages that haven't completed yet
function clampRestart(
  restart: RestartMode,
  book: BookWithRelations,
): RestartMode {
  if (restart === false || restart === "full") return restart

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
  if (restart === "full") return "SPLIT_TRACKS"
  if (restart === "transcription") return "TRANSCRIBE_CHAPTERS"
  if (restart === "sync") return "SYNC_CHAPTERS"
  return book.readaloud?.currentStage ?? "SPLIT_TRACKS"
}
