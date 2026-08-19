import { EventEmitter } from "node:events"

import { type UUID } from "./uuid"

export type JobEvent = {
  type: "jobCreated" | "jobUpdated" | "jobDeleted"
  jobUuid: UUID
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
