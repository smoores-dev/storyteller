import { getSetting } from "@/database/settings"
import { logger } from "@/logging"

import { runScheduledExistingBooksScan } from "./scanManager"

let scheduledScanTimer: NodeJS.Timeout | null = null

function clearScheduledExistingBookScanTimer() {
  if (!scheduledScanTimer) {
    return
  }

  clearInterval(scheduledScanTimer)
  scheduledScanTimer = null
}

export async function refreshScheduledExistingBookScan() {
  clearScheduledExistingBookScanTimer()

  const intervalMinutes = await getSetting("existingBooksScanIntervalMinutes")
  if (!intervalMinutes || intervalMinutes <= 0) {
    return
  }

  const intervalMs = Math.floor(intervalMinutes * 60 * 1000)
  if (intervalMs <= 0) {
    return
  }

  scheduledScanTimer = setInterval(() => {
    const controller = new AbortController()
    void runScheduledExistingBooksScan(controller.signal).catch(
      (error: unknown) => {
        logger.error("Scheduled existing-book scan failed")
        logger.error(error)
      },
    )
  }, intervalMs)

  logger.info(
    `Configured scheduled existing-book scan every ${intervalMinutes} minute(s)`,
  )
}
