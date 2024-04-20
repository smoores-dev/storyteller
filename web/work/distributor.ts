import { UUID } from "@/uuid"
import { join } from "node:path"
import Piscina from "piscina"
import { cwd } from "node:process"
import { ProcessingTaskType } from "@/apiModels/models/ProcessingStatus"
import { BaseEvent, BookEvents } from "@/events"

const controllers: Map<UUID, AbortController> = new Map()
const queue: UUID[] = []

const filename = join(cwd(), "work-dist", "worker.js")

const piscina = new Piscina({
  filename,
  maxThreads: 1,
})

piscina.on("message", (event: BookProcessingEvent) => {
  BookEvents.emit("message", event)

  if (event.type === "taskStarted") {
    const index = queue.indexOf(event.bookUuid)
    queue.splice(index, 1)
  }
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
}

export function startProcessing(bookUuid: UUID) {
  queue.push(bookUuid)
  BookEvents.emit("message", {
    type: "taskQueued",
    bookUuid,
    payload: undefined,
  })

  const abortController = new AbortController()
  controllers.set(bookUuid, abortController)
  void piscina
    .run({ bookUuid }, { signal: abortController.signal })
    .catch((err: unknown) => {
      if (err instanceof Error && err.name === "AbortError") {
        console.log(`Processing for book ${bookUuid} aborted by user`)
        BookEvents.emit("message", {
          type: "taskStopped",
          bookUuid,
          payload: undefined,
        })
        return
      }

      console.error(`Processing for book ${bookUuid} failed unexpectedly`)
      console.error(err)
    })
    .finally(() => {
      controllers.delete(bookUuid)
    })
}

export function isProcessing(bookUuid: UUID) {
  return controllers.has(bookUuid) && !isQueued(bookUuid)
}

export function isQueued(bookUuid: UUID) {
  return queue.includes(bookUuid)
}

export type BookProcessingEvent =
  | BaseEvent<"taskQueued">
  | BaseEvent<"taskStopped">
  | BaseEvent<"taskStarted">
  | BaseEvent<"taskCompleted">
  | BaseEvent<"taskFailed">
  | BaseEvent<"taskProgressUpdated", { progress: number }>
  | BaseEvent<"taskTypeUpdated", { taskType: ProcessingTaskType }>
