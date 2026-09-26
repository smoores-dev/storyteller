import { withHasPermission } from "@/auth/auth"
import {
  measureImageCache,
  measureLogs,
  measureStaleUploads,
} from "@/maintenance"

export const dynamic = "force-dynamic"

/**
 * @summary Measure clearable server storage
 *
 * @desc Reports the size of the image cache, uploads that were started more
 *       than a day ago and never finished, and the server log files.
 */
export const GET = withHasPermission("settingsUpdate")(async () => {
  const [imageCache, uploads, logs] = await Promise.all([
    measureImageCache(),
    measureStaleUploads(),
    measureLogs(),
  ])

  return Response.json({ imageCache, uploads, logs })
})
