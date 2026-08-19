import { createReadStream } from "node:fs"
import { rm, stat } from "node:fs/promises"
import { Readable } from "node:stream"

import contentDisposition from "content-disposition"
import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { snapshotToTempFile } from "@/backups"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("settingsUpdate")(async () => {
  let path: string
  try {
    path = await snapshotToTempFile()
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to snapshot database: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    )
  }

  const { size } = await stat(path)
  const readStream = createReadStream(path)
  readStream.once("close", () => {
    void rm(path, { force: true })
  })

  return new Response(Readable.toWeb(readStream) as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(size),
      "Content-Disposition": contentDisposition(
        `storyteller-${new Date().toISOString().slice(0, 10)}.db`,
        { type: "attachment" },
      ),
    },
  })
})
