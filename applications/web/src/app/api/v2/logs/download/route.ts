import { createReadStream } from "node:fs"
import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { listLogFiles, todayDateString } from "@/logFiles"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("settingsUpdate")(async (request) => {
  const url = new URL(request.url)
  const date = url.searchParams.get("date") ?? todayDateString()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  }

  const file = (await listLogFiles()).find((f) => f.date === date)

  if (!file) {
    return NextResponse.json({ error: "No log file for date" }, { status: 404 })
  }

  const body = Readable.toWeb(
    createReadStream(file.path),
  ) as ReadableStream<Uint8Array>

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="storyteller-${file.date}.log"`,
    },
  })
})
