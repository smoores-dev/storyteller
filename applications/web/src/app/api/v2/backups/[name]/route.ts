import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"

import contentDisposition from "content-disposition"
import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { deleteBackup, resolveBackupPath } from "@/backups"

export const dynamic = "force-dynamic"

type Params = Promise<{ name: string }>

export const GET = withHasPermission<Params>("settingsUpdate")(async (
  _request,
  context,
) => {
  const { name } = await context.params
  const path = resolveBackupPath(name)
  if (!path) {
    return NextResponse.json({ error: "Invalid backup name" }, { status: 400 })
  }

  let size: number
  try {
    ;({ size } = await stat(path))
  } catch {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 })
  }

  return new Response(
    Readable.toWeb(createReadStream(path)) as ReadableStream,
    {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(name, { type: "attachment" }),
      },
    },
  )
})

export const DELETE = withHasPermission<Params>("settingsUpdate")(async (
  _request,
  context,
) => {
  const { name } = await context.params
  const deleted = await deleteBackup(name)
  if (!deleted) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
})
