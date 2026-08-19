import { mkdir, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { backupDatabase } from "@/database/connection"
import { BACKUP_DIR } from "@/directories"
import { logger } from "@/logging"
import { getCurrentVersion } from "@/versions"

export type BackupInfo = {
  name: string
  size: number
  createdAt: string
}

const AUTO_PREFIX = "storyteller-auto-"
const MANUAL_PREFIX = "storyteller-manual-"

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

export async function createBackup(kind: "auto" | "manual"): Promise<string> {
  const prefix = kind === "auto" ? AUTO_PREFIX : MANUAL_PREFIX
  const name = `${prefix}${getCurrentVersion()}-${timestamp()}.db`
  await mkdir(BACKUP_DIR, { recursive: true })
  await backupDatabase(join(BACKUP_DIR, name))
  logger.info(`Created ${kind} database backup: ${name}`)
  return name
}

export async function listBackups(): Promise<BackupInfo[]> {
  let names: string[]
  try {
    names = await readdir(BACKUP_DIR)
  } catch {
    return []
  }

  const backups = await Promise.all(
    names
      .filter((name) => name.endsWith(".db"))
      .map(async (name) => {
        const stats = await stat(join(BACKUP_DIR, name))
        return {
          name,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
        }
      }),
  )

  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function resolveBackupPath(name: string): string | null {
  if (
    !name.endsWith(".db") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..")
  ) {
    return null
  }
  return join(BACKUP_DIR, name)
}

export async function deleteBackup(name: string): Promise<boolean> {
  const path = resolveBackupPath(name)
  if (!path) return false
  try {
    await rm(path)
    return true
  } catch {
    return false
  }
}

export async function pruneAutoBackups(retentionCount: number): Promise<void> {
  const autoBackups = (await listBackups()).filter((backup) =>
    backup.name.startsWith(AUTO_PREFIX),
  )

  for (const backup of autoBackups.slice(retentionCount)) {
    await rm(join(BACKUP_DIR, backup.name), { force: true })
    logger.info(`Pruned old database backup: ${backup.name}`)
  }
}

export async function snapshotToTempFile(): Promise<string> {
  const path = join(
    tmpdir(),
    `storyteller-download-${process.pid}-${timestamp()}.db`,
  )
  await backupDatabase(path)
  return path
}
