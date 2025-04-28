import { withHasPermission } from "@/auth"
import { subscribeToBookEvents } from "@/events"
import { NextResponse } from "next/server"
// import { ReadableStream } from "node:stream/web"

/**
 * @summary Subscribe to updates to the book list
 * @desc Uses server-sent events to notify subscribers of updates
 *       to the set of books.
 */
export const GET = withHasPermission("bookList")((request) => {
  if (request.headers.get("Accept") !== "text/event-stream") {
    return new NextResponse(null, { status: 405 })
  }

  let unsubscribe: (() => void) | null = null
  const readable = new ReadableStream({
    start(controller) {
      unsubscribe = subscribeToBookEvents((event) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      })
    },
    cancel() {
      unsubscribe?.()
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "none",
    },
  })
})
