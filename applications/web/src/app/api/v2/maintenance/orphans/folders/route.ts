import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { deleteOrphanFolders } from "@/maintenance"

export const dynamic = "force-dynamic"

/**
 * @summary Delete orphaned book folders
 *
 * @desc Deletes the named folders from the assets directory. Each folder is
 *       checked again right before it is deleted, and is kept if a book
 *       started using it or anything in it changed in the last hour.
 */
export const DELETE = withHasPermission("settingsUpdate")(async (request) => {
  const body: unknown = await request.json().catch(() => null)
  const names =
    body && typeof body === "object" && "names" in body ? body.names : null

  if (
    !Array.isArray(names) ||
    !names.every((name) => typeof name === "string")
  ) {
    return NextResponse.json(
      { message: "Pass the folders to delete as `names`" },
      { status: 400 },
    )
  }

  const deleted = await deleteOrphanFolders(names)
  return NextResponse.json({ deleted })
})
