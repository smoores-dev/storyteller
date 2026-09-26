import { withHasPermission } from "@/auth/auth"
import { deleteUnusedImages } from "@/maintenance"

export const dynamic = "force-dynamic"

/**
 * @summary Delete unused images
 *
 * @desc Deletes stored images that no book, format or server setting uses.
 */
export const DELETE = withHasPermission("settingsUpdate")(async () => {
  const deleted = await deleteUnusedImages()
  return Response.json({ deleted })
})
