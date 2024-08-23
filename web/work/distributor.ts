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

const controllers: Map<UUID, AbortController> = new Map()
const queue: UUID[] = []

const filename = join(cwd(), "work-dist", "worker.js")

const piscina = new Piscina({
  filename,
  maxThreads: 1,
})

export function cancelProcessing(bookUuid: UUID) {
  const abortController = controllers.get(bookUuid)
  if (!abortController) {
    const index = queue.indexOf(bookUuid)
    if (index === -1) return
    queue.splice(index, 1)
    return
  }

  abortController.abort()
  if (controllers.has(bookUuid)) controllers.delete(bookUuid)
}

export async function startProcessing(bookUuid: UUID) {
  if (controllers.has(bookUuid)) return

  const settings = getSettings()

  const { port1, port2 } = new MessageChannel()

  port2.on("message", (event: BookProcessingEvent) => {
    BookEvents.emit("message", event)

    if (event.type === "processingStarted") {
      const index = queue.indexOf(event.bookUuid)
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

  queue.push(bookUuid)
  BookEvents.emit("message", {
    type: "processingQueued",
    bookUuid,
    payload: undefined,
  })

  const abortController = new AbortController()
  controllers.set(bookUuid, abortController)

  try {
    await piscina.run(
      { bookUuid, settings, port: port1 },
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
  return queue.includes(bookUuid)
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
