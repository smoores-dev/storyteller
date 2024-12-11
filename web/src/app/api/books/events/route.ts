import { withHasPermission } from "@/auth"
import { subscribeToBookEvents } from "@/events"
import { NextResponse } from "next/server"
// import { ReadableStream } from "node:stream/web"

export const GET = withHasPermission("book_list")((request) => {
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
