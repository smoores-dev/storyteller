import { mkdir, readdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"

import { SCRATCH_DIR } from "@/directories"
import { logger } from "@/logging"

export async function initScratchDir(): Promise<void> {
  const scratchDir = resolve(SCRATCH_DIR)
  await mkdir(scratchDir, { recursive: true })

  const entries = await readdir(scratchDir)
  const results = await Promise.allSettled(
    entries.map((entry) =>
      rm(join(scratchDir, entry), { recursive: true, force: true }),
    ),
  )
  const failed = results.filter((result) => result.status === "rejected")
  if (failed.length) {
    logger.warn({
      msg: `Failed to clear ${failed.length} leftover entries from the scratch directory. Your disk may be filling up with old, unused files. Clear out ${scratchDir} to free up space.`,
      err: failed[0]?.reason,
    })
  }
  if (entries.length > failed.length) {
    logger.info(
      `Cleared ${entries.length - failed.length} leftover entries from the scratch directory at ${scratchDir}`,
    )
  }

  process.env["STORYTELLER_SCRATCH_DIR"] = scratchDir
  process.env["TMPDIR"] = scratchDir
  process.env["TMP"] = scratchDir
  process.env["TEMP"] = scratchDir
}
