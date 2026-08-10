import { deleteImage, getUnreferencedImages } from "@/database/images"
import { logger } from "@/logging"

import { deleteImageBlob } from "./store"
import { deleteImageVariants } from "./variants"

export async function sweepUnreferencedImages(): Promise<number> {
  const orphans = await getUnreferencedImages()

  for (const orphan of orphans) {
    try {
      await deleteImage(orphan.uuid)
      await deleteImageVariants(orphan.sha256)
      await deleteImageBlob(orphan.sha256)
    } catch (err) {
      logger.warn({
        err,
        msg: `Could not remove the unreferenced image ${orphan.sha256}`,
      })
    }
  }

  return orphans.length
}
