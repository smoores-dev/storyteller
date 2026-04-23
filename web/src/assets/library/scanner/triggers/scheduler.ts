import cron, { type ScheduledTask } from "node-cron"

import { scanLibrary } from "@/assets/library/scanner/scan"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"

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

  return `0 */${Math.max(1, hours)} * * *`
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

export class Scheduler {
  private task: ScheduledTask | null = null

  async refresh(): Promise<void> {
    await this.stop()

    const expression = await resolveCronExpression()
    if (!expression) {
      return
    }

    this.task = cron.schedule(
      expression,
      async () => {
        const controller = new AbortController()

        try {
          logger.info("Running scheduled library scan")
          await scanLibrary({
            source: "scheduled",
            options: { concurrency: 8 },
            signal: controller.signal,
          })
        } catch (error) {
          logger.error({
            msg: "Scheduled full scan failed",
            err: error,
          })
        }
      },
      { name: "scheduled-library-scan", noOverlap: true },
    )

    logger.info(`Scheduled library scan configured (cron: ${expression})`)
  }

  async stop(): Promise<void> {
    if (!this.task) {
      return
    }

    await this.task.stop()
    this.task = null
  }
}

declare global {
  // eslint-disable-next-line no-var
  var schedulerInstance: Scheduler | undefined
}

export function getScheduler(): Scheduler {
  if (!globalThis.schedulerInstance) {
    globalThis.schedulerInstance = new Scheduler()
  }

  return globalThis.schedulerInstance
}
