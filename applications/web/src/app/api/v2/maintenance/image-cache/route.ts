import { withHasPermission } from "@/auth/auth"
import { clearImageCache } from "@/maintenance"

export const dynamic = "force-dynamic"

/**
 * @summary Clear the image cache
 *
 * @desc Deletes every resized image. They are made again the next time an
 *       image is requested at that size.
 */
export const DELETE = withHasPermission("settingsUpdate")(async () => {
  await clearImageCache()
  return new Response(null, { status: 204 })
})
