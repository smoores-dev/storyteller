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

export const BookEvents = new EventEmitter<{
  message: [BookEvent]
}>()

export function subscribeToBookEvents(listener: (event: BookEvent) => void) {
  BookEvents.on("message", listener)

  return () => {
    BookEvents.off("message", listener)
  }
}
