import { getSetting } from "@/database/settings"
import { logger } from "@/logging"

import { runScheduledFullScan } from "./scanManager"

let scheduledScanTimer: NodeJS.Timeout | null = null
let scheduledScanAborted = false

function clearScheduledScanTimer() {
  scheduledScanAborted = true
  if (!scheduledScanTimer) {
    return
  }

  clearTimeout(scheduledScanTimer)
  scheduledScanTimer = null
}

function scheduleNext(intervalMs: number) {
  scheduledScanTimer = setTimeout(() => {
    if (scheduledScanAborted) {
      return
    }

    const controller = new AbortController()
    runScheduledFullScan(controller.signal)
      .catch((error: unknown) => {
        logger.error("Scheduled full scan failed")
        logger.error(error)
      })
      .finally(() => {
        if (!scheduledScanAborted) {
          scheduleNext(intervalMs)
        }
      })
  }, intervalMs)
}

export async function refreshScheduledScan() {
  clearScheduledScanTimer()

  const intervalMinutes = await getSetting("existingBooksScanIntervalMinutes")
  if (!intervalMinutes || intervalMinutes <= 0) {
    return
  }

  const intervalMs = Math.floor(intervalMinutes * 60 * 1000)
  if (intervalMs <= 0) {
    return
  }

  scheduledScanAborted = false
  scheduleNext(intervalMs)

  logger.info(
    `Configured scheduled full scan every ${intervalMinutes} minute(s)`,
  )
}
