import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { createBackup, listBackups } from "@/backups"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("settingsUpdate")(async () => {
  return NextResponse.json({ backups: await listBackups() })
})

export const POST = withHasPermission("settingsUpdate")(async () => {
  try {
    const name = await createBackup("manual")
    return NextResponse.json({ name }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to create backup: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    )
  }
})
