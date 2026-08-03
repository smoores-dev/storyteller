import { type BookEvent } from "@/events"

type Listener = (event: BookEvent) => void

let eventSource: EventSource | null = null
const listeners = new Set<Listener>()

function handleMessage(m: MessageEvent<string>) {
  const event = JSON.parse(m.data) as BookEvent
  // copy to tolerate unsubscribe during iteration
  for (const listener of [...listeners]) listener(event)
}

export function subscribeToBookEventStream(listener: Listener): () => void {
  if (typeof EventSource === "undefined") return () => {}

  listeners.add(listener)
  if (!eventSource) {
    eventSource = new EventSource("/api/v2/books/events")
    eventSource.addEventListener("message", handleMessage)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && eventSource) {
      eventSource.close()
      eventSource = null
    }
  }
}
