import { type ScheduledTask } from "node-cron"

import { scanLibrary } from "@/assets/library/scanner/scan"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"

export class Scheduler {
  private task: ScheduledTask | null = null

  async refresh(): Promise<void> {
    await this.stop()

    const expression = await getSetting("scanCronExpression")
    if (!expression) {
      return
    }

    // need to dynamically import, otherwise it ends up in the worker bundle
    // where it causes issues
    const cron = await import("node-cron")

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
