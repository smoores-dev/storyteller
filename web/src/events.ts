import { EventEmitter } from "node:events"
import { BookProcessingEvent } from "./work/distributor"
import { UUID } from "./uuid"
import { BookDetail } from "./apiModels"

export type BaseEvent<Type extends string, Payload = void> = {
  type: Type
  bookUuid: UUID
  payload: Payload
}

export type BookDetailMessage =
  | BaseEvent<"bookCreated", BookDetail>
  | BaseEvent<"bookDeleted">
  | BaseEvent<"bookUpdated", Partial<BookDetail>>

export type BookEvent = BookProcessingEvent | BookDetailMessage

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
  var BookEvents:
    | EventEmitter<{
        message: [BookEvent]
      }>
    | undefined
  /* eslint-enable no-var */
}

export let BookEvents: EventEmitter<{
  message: [BookEvent]
}>

if (globalThis.BookEvents) {
  BookEvents = globalThis.BookEvents
} else {
  BookEvents = new EventEmitter<{
    message: [BookEvent]
  }>()
  globalThis.BookEvents = BookEvents
}

export function subscribeToBookEvents(listener: (event: BookEvent) => void) {
  BookEvents.on("message", listener)

  return () => {
    BookEvents.off("message", listener)
  }
}
