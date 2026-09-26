import { withHasPermission } from "@/auth/auth"
import { findOrphanFolders, measureUnusedImages } from "@/maintenance"

export const dynamic = "force-dynamic"

/**
 * @summary List files no book uses anymore
 *
 * @desc Lists folders in the assets directory that no book points to and
 *       that only hold the files Storyteller keeps for a book, and measures
 *       stored images that nothing uses. Folders with anything changed in
 *       the last hour are left out, so an import in progress is never
 *       listed. `hasBookFiles` marks folders that still hold ebook, audio
 *       or readaloud files.
 */
export const GET = withHasPermission("settingsUpdate")(async () => {
  const [folders, images] = await Promise.all([
    findOrphanFolders(),
    measureUnusedImages(),
  ])

  return Response.json({ folders, images })
})
