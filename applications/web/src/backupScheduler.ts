import { type ScheduledTask } from "node-cron"

import { createBackup, pruneAutoBackups } from "@/backups"
import { getSettings } from "@/database/settings"
import { logger } from "@/logging"

export const DEFAULT_BACKUP_RETENTION = 5

export class BackupScheduler {
  private task: ScheduledTask | null = null

  async refresh(): Promise<void> {
    await this.stop()

    const settings = await getSettings()
    const expression = settings.backupCronExpression
    if (!expression) {
      return
    }

    // need to dynamically import, otherwise it ends up in the worker bundle
    // where it causes issues
    const cron = await import("node-cron")

    this.task = cron.schedule(
      expression,
      async () => {
        try {
          logger.info("Running scheduled database backup")
          await createBackup("auto")
          await pruneAutoBackups(
            settings.backupRetentionCount ?? DEFAULT_BACKUP_RETENTION,
          )
        } catch (error) {
          logger.error({
            msg: "Scheduled database backup failed",
            err: error,
          })
        }
      },
      { name: "scheduled-backup", noOverlap: true },
    )

    logger.info(`Scheduled database backups configured (cron: ${expression})`)
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
  var backupSchedulerInstance: BackupScheduler | undefined
}

export function getBackupScheduler(): BackupScheduler {
  if (!globalThis.backupSchedulerInstance) {
    globalThis.backupSchedulerInstance = new BackupScheduler()
  }

  return globalThis.backupSchedulerInstance
}
