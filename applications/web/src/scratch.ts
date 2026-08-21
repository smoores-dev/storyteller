import { mkdir, readdir, rm } from "node:fs/promises"
import { join } from "node:path"

import { SCRATCH_DIR } from "@/directories"
import { logger } from "@/logging"

export async function initScratchDir(): Promise<void> {
  await mkdir(SCRATCH_DIR, { recursive: true })

  const entries = await readdir(SCRATCH_DIR)
  const results = await Promise.allSettled(
    entries.map((entry) =>
      rm(join(SCRATCH_DIR, entry), { recursive: true, force: true }),
    ),
  )
  const failed = results.filter((result) => result.status === "rejected")
  if (failed.length) {
    logger.warn({
      msg: `Failed to clear ${failed.length} leftover entries from the scratch directory`,
      scratchDir: SCRATCH_DIR,
      err: failed[0]?.reason,
    })
  }
  if (entries.length > failed.length) {
    logger.info(
      `Cleared ${entries.length - failed.length} leftover entries from the scratch directory at ${SCRATCH_DIR}`,
    )
  }

  process.env["TMPDIR"] = SCRATCH_DIR
  process.env["TMP"] = SCRATCH_DIR
  process.env["TEMP"] = SCRATCH_DIR
}
