import cron, { type ScheduledTask } from "node-cron"

import { getSetting } from "@/database/settings"
import { logger } from "@/logging"

import { runScheduledFullScan } from "./scanManager"

let scheduledTask: ScheduledTask | null = null

async function clearScheduledTask() {
  if (!scheduledTask) {
    return
  }

  await scheduledTask.stop()
  scheduledTask = null
}

function minutesToCronExpression(minutes: number): string {
  if (minutes < 1) {
    return "* * * * *"
  }

  if (minutes < 60 && 60 % minutes === 0) {
    return `*/${minutes} * * * *`
  }

  const hours = Math.floor(minutes / 60)

  if (hours >= 1 && hours <= 24 && 24 % hours === 0) {
    const remainderMinutes = minutes % 60
    return `${remainderMinutes} */${hours} * * *`
  }

  // fallback: run at minute 0 of the nearest whole-hour interval
  const clampedHours = Math.max(1, hours)
  return `0 */${clampedHours} * * *`
}

export async function refreshScheduledScan() {
  await clearScheduledTask()

  const intervalMinutes = await getSetting("existingBooksScanIntervalMinutes")
  if (!intervalMinutes || intervalMinutes <= 0) {
    return
  }

  const expression = minutesToCronExpression(intervalMinutes)

  scheduledTask = cron.schedule(
    expression,
    async () => {
      const controller = new AbortController()
      try {
        await runScheduledFullScan(controller.signal)
      } catch (error: unknown) {
        logger.error("Scheduled full scan failed")
        logger.error(error)
      }
    },
    { name: "scheduled-library-scan", noOverlap: true },
  )

  logger.info(
    `Configured scheduled full scan every ${intervalMinutes} minute(s) (cron: ${expression})`,
  )
}
