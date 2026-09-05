import { EventEmitter } from "node:events"

import { type DisplayJob } from "./database/jobs"
import { type UUID } from "./uuid"

export const JOB_EVENT_TYPES = [
  "jobCreated",
  "jobUpdated",
  "jobDeleted",
] as const
export type JobEventType = (typeof JOB_EVENT_TYPES)[number]

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

export type JobEventBase<type extends JobEventType, Payload = void> = {
  type: type
  jobUuid: UUID

  payload: Payload
}

export type JobCreatedEvent = JobEventBase<"jobCreated", DisplayJob>

export type JobUpdatedEvent = JobEventBase<"jobUpdated", Partial<DisplayJob>>

export type JobDeletedEvent = JobEventBase<"jobDeleted">

export type JobEvent = JobCreatedEvent | JobUpdatedEvent | JobDeletedEvent
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
  var JobEvents:
    | EventEmitter<{
        message: [JobEvent]
      }>
    | undefined
  /* eslint-enable no-var */
}

export let JobEvents: EventEmitter<{
  message: [JobEvent]
}>

if (globalThis.JobEvents) {
  JobEvents = globalThis.JobEvents
} else {
  JobEvents = new EventEmitter<{
    message: [JobEvent]
  }>()
  globalThis.JobEvents = JobEvents
}

export function subscribeToJobEvents(listener: (event: JobEvent) => void) {
  JobEvents.on("message", listener)

  return () => {
    JobEvents.off("message", listener)
  }
}
