import { writeFile } from "node:fs/promises"

import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getLogFilePath } from "@/logFiles"

export const dynamic = "force-dynamic"

export const POST = withHasPermission("settingsUpdate")(async () => {
  const filePath = getLogFilePath()

  try {
    await writeFile(filePath, "")
  } catch {
    return NextResponse.json({ error: "Failed to clear logs" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})
