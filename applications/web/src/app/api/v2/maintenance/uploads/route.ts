import { withHasPermission } from "@/auth/auth"
import { clearStaleUploads } from "@/maintenance"

export const dynamic = "force-dynamic"

/**
 * @summary Delete unfinished uploads
 *
 * @desc Deletes uploads that were started more than a day ago and never
 *       finished.
 */
export const DELETE = withHasPermission("settingsUpdate")(async () => {
  await clearStaleUploads()
  return new Response(null, { status: 204 })
})
