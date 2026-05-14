import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

import watcher from "@parcel/watcher"

import { type ImportPathChange } from "@/assets/library/changes"
import { DATA_DIR } from "@/directories"

const SNAPSHOT_DIR = join(DATA_DIR, ".autoimport", "watcher-snapshots")
const WATCHER_OPTIONS = {
  backend: "watchman",
  ignore: [
    "**/*.watchman-cookie*",
    "**/*.json",
    "**/transcoded audio/*",
    "**/.DS_Store",
    "**/transcriptions/*",
    "**/ebook cover/*",
    "**/audiobook cover/*",
    "**/.storyteller",
  ],
} as const satisfies watcher.Options

type SnapshotChanges = {
  snapshotExists: boolean
  changes: ImportPathChange[]
}

function snapshotFilename(importPath: string): string {
  const hash = createHash("sha1").update(importPath).digest("hex")
  return `${hash}.snapshot`
}

function snapshotPath(importPath: string): string {
  return join(SNAPSHOT_DIR, snapshotFilename(importPath))
}

function isFileNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if ("code" in error && error.code === "ENOENT") {
    return true
  }

  // native @parcel/watcher errors don't carry a `code` property,
  // they surface the OS message directly in the error string
  return error.message.includes("No such file or directory")
}

async function ensureSnapshotDir() {
  await mkdir(SNAPSHOT_DIR, { recursive: true })
}

export async function readSnapshotChanges(
  importPath: string,
): Promise<SnapshotChanges> {
  await ensureSnapshotDir()

  const snapshot = snapshotPath(importPath)

  try {
    const events = await watcher.getEventsSince(
      importPath,
      snapshot,
      WATCHER_OPTIONS,
    )

    return {
      snapshotExists: true,
      changes: events.map((event) => ({
        path: event.path,
        type: event.type,
      })),
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return { snapshotExists: false, changes: [] }
    }

    throw error
  }
}

export async function writeWatcherSnapshot(importPath: string): Promise<void> {
  await ensureSnapshotDir()

  await watcher.writeSnapshot(
    importPath,
    snapshotPath(importPath),
    WATCHER_OPTIONS,
  )
}

export function getWatcherOptions() {
  return WATCHER_OPTIONS
}
