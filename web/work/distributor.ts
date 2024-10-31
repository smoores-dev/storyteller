import { UUID } from "@/uuid"
import { join } from "node:path"
import Piscina from "piscina"
import { MessageChannel } from "node:worker_threads"
import { cwd } from "node:process"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { BaseEvent, BookEvents } from "@/events"
import {
  createProcessingTask,
  getProcessingTasksForBook,
  resetProcessingTasksForBook,
  updateTaskProgress,
  updateTaskStatus,
} from "@/database/processingTasks"
import { getSettings } from "@/database/settings"
import type processBook from "./worker"

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
  var queue: { bookUuid: UUID; restart: boolean }[] | undefined
  var piscina: Piscina | undefined
  /* eslint-enable no-var */
}

let controllers: Map<UUID, AbortController>
if (globalThis.controllers) {
  controllers = globalThis.controllers
} else {
  controllers = new Map()
  globalThis.controllers = controllers
}

let queue: { bookUuid: UUID; restart: boolean }[]
if (globalThis.queue) {
  queue = globalThis.queue
} else {
  queue = []
  globalThis.queue = queue
}

const filename = join(cwd(), "work-dist", "worker.js")

let piscina: Piscina
if (globalThis.piscina) {
  piscina = globalThis.piscina
} else {
  piscina = new Piscina({
    filename,
    maxThreads: 1,
  })
  globalThis.piscina = piscina
}

export function cancelProcessing(bookUuid: UUID) {
  const abortController = controllers.get(bookUuid)
  if (!abortController) {
    const index = queue.findIndex((enqueued) => bookUuid === enqueued.bookUuid)
    if (index === -1) return
    queue.splice(index, 1)
    return
  }

  abortController.abort()
  if (controllers.has(bookUuid)) controllers.delete(bookUuid)
}

export async function startProcessing(bookUuid: UUID, restart: boolean) {
  if (controllers.has(bookUuid)) return

  const settings = getSettings()

  const { port1, port2 } = new MessageChannel()

  port2.on("message", (event: BookProcessingEvent) => {
    BookEvents.emit("message", event)

    if (event.type === "processingStarted") {
      const index = queue.findIndex(
        ({ bookUuid }) => bookUuid === event.bookUuid,
      )
      queue.splice(index, 1)
      resetProcessingTasksForBook(event.bookUuid)
      const currentTasks = getProcessingTasksForBook(event.bookUuid)
      console.log("emitting current tasks back")
      port2.postMessage(currentTasks)
    }
    if (event.type === "taskTypeUpdated") {
      const { taskUuid, taskType, taskStatus } = event.payload
      const returnUuid =
        taskUuid ??
        createProcessingTask(
          taskType,
          ProcessingTaskStatus.STARTED,
          event.bookUuid,
        )

      if (taskStatus !== ProcessingTaskStatus.STARTED) {
        updateTaskStatus(returnUuid, ProcessingTaskStatus.STARTED)
      }
      port2.postMessage(returnUuid)
    }
    if (event.type === "taskProgressUpdated") {
      const { progress, taskUuid } = event.payload
      updateTaskProgress(taskUuid, progress)
    }
    if (event.type === "taskCompleted") {
      const { taskUuid } = event.payload
      updateTaskStatus(taskUuid, ProcessingTaskStatus.COMPLETED)
    }
    if (event.type === "processingFailed") {
      const { taskUuid } = event.payload
      updateTaskStatus(taskUuid, ProcessingTaskStatus.IN_ERROR)
    }
  })

  queue.push({ bookUuid, restart })
  BookEvents.emit("message", {
    type: "processingQueued",
    bookUuid,
    payload: undefined,
  })

  const abortController = new AbortController()
  controllers.set(bookUuid, abortController)

  try {
    await piscina.run(
      { bookUuid, restart, settings, port: port1 } satisfies Parameters<
        typeof processBook
      >[0],
      { transferList: [port1], signal: abortController.signal },
    )
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.log(`Processing for book ${bookUuid} aborted by user`)
      BookEvents.emit("message", {
        type: "processingStopped",
        bookUuid,
        payload: undefined,
      })
      return
    }

    console.error(`Processing for book ${bookUuid} failed unexpectedly`)
    console.error(err)
  } finally {
    if (controllers.has(bookUuid)) controllers.delete(bookUuid)
  }
}

export function isProcessing(bookUuid: UUID) {
  return controllers.has(bookUuid) && !isQueued(bookUuid)
}

export function isQueued(bookUuid: UUID) {
  return queue.some((enqueued) => enqueued.bookUuid === bookUuid)
}

export type BookProcessingEvent =
  | BaseEvent<"processingQueued">
  | BaseEvent<"processingStopped">
  | BaseEvent<"processingStarted">
  | BaseEvent<"processingCompleted">
  | BaseEvent<"taskCompleted", { taskUuid: UUID }>
  | BaseEvent<"processingFailed", { taskUuid: UUID }>
  | BaseEvent<"taskProgressUpdated", { taskUuid: UUID; progress: number }>
  | BaseEvent<
      "taskTypeUpdated",
      {
        taskUuid: UUID | undefined
        taskType: ProcessingTaskType
        taskStatus: ProcessingTaskStatus
      }
    >
