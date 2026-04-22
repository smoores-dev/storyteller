import cron, { type ScheduledTask } from "node-cron"

import { Scan } from "@/assets/library/scan"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"

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

  const clampedHours = Math.max(1, hours)
  return `0 */${clampedHours} * * *`
}

async function resolveCronExpression(): Promise<string | null> {
  const [cronExpression, intervalMinutes] = await Promise.all([
    getSetting("scanCronExpression"),
    getSetting("existingBooksScanIntervalMinutes"),
  ])

  if (cronExpression) {
    return cronExpression
  }

  if (!intervalMinutes || intervalMinutes <= 0) {
    return null
  }

  return minutesToCronExpression(intervalMinutes)
}

export async function refreshScheduledScan() {
  await clearScheduledTask()

  const expression = await resolveCronExpression()
  if (!expression) {
    return
  }

  scheduledTask = cron.schedule(
    expression,
    async () => {
      const controller = new AbortController()

      try {
        logger.info("Running scheduled library scan")
        const scan = await Scan.fullLibrary("scheduled")
        await scan.execute(controller.signal)
      } catch (error: unknown) {
        logger.error({ msg: "Scheduled full scan failed", err: error })
      }
    },
    { name: "scheduled-library-scan", noOverlap: true },
  )

  logger.info(`Scheduled library scan configured (cron: ${expression})`)
}
