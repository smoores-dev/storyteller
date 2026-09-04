import { unlink } from "node:fs/promises"

import { getSettings } from "@/database/settings"
import { DEFAULT_LOG_RETENTION_DAYS } from "@/database/settingsTypes"
import { LOG_DIR } from "@/directories"
import { listLogFiles, todayDateString } from "@/logFiles"
import { logger } from "@/logging"

const DAY_MS = 24 * 60 * 60 * 1000

export async function pruneLogs(
  retentionDays: number,
  dir = LOG_DIR,
  today = todayDateString(),
) {
  const cutoff = new Date(today).getTime() - retentionDays * DAY_MS

  for (const file of await listLogFiles(dir)) {
    if (new Date(file.date).getTime() < cutoff) {
      await unlink(file.path)
    }
  }
}

export async function runLogRetention() {
  try {
    const settings = await getSettings()
    await pruneLogs(settings.logRetentionDays ?? DEFAULT_LOG_RETENTION_DAYS)
  } catch (err) {
    logger.error({ err }, "Log retention failed")
  }
}

export function startLogRetention() {
  void runLogRetention()
  setInterval(() => void runLogRetention(), 60 * 60 * 1000).unref()
}
