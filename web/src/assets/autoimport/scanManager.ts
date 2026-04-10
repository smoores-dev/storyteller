import { AsyncMutex } from "@esfx/async-mutex"

import { getBook } from "@/database/books"
import { getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { type ImportPathChange, scan, scanChangedPaths } from "./scan"
import { scanExistingBooks } from "./scanExisting"
import { type ScanOptions } from "./scanner"

type ScanSource =
  | "watcher"
  | "manual-existing"
  | "manual-imports"
  | "manual-full"
  | "scheduled"

type ScanState = {
  running: boolean
  source: ScanSource | null
  startedAt: number | null
}

const lock = new AsyncMutex()
const state: ScanState = {
  running: false,
  source: null,
  startedAt: null,
}

function getImportTargets(
  rootImportPaths: string[] | null,
  collections: Awaited<ReturnType<typeof getCollections>>,
) {
  const targets: { importPath: string; collectionUuid: UUID | null }[] = []

  if (rootImportPaths) {
    for (const importPath of rootImportPaths) {
      targets.push({ importPath, collectionUuid: null })
    }
  }

  for (const collection of collections) {
    if (!collection.importPath) {
      continue
    }

    targets.push({
      importPath: collection.importPath,
      collectionUuid: collection.uuid,
    })
  }

  return targets
}

async function runExclusive(
  source: ScanSource,
  signal: AbortSignal,
  callback: () => Promise<void>,
) {
  await lock.lock()
  if (signal.aborted) {
    lock.unlock()
    return
  }

  state.running = true
  state.source = source
  state.startedAt = Date.now()

  try {
    await callback()
  } finally {
    state.running = false
    state.source = null
    state.startedAt = null
    lock.unlock()
  }
}

async function runAllImportScansUnlocked(signal: AbortSignal) {
  const [rootImportPaths, collections] = await Promise.all([
    getSetting("importPath"),
    getCollections(),
  ])
  const targets = getImportTargets(rootImportPaths, collections)

  for (const target of targets) {
    if (signal.aborted) {
      return
    }

    await scan(target.importPath, target.collectionUuid, signal)
  }
}

export function getScanState(): ScanState {
  return { ...state }
}

export async function runImportPathScan(
  importPath: string,
  collectionUuid: UUID | null,
  signal: AbortSignal,
) {
  await runExclusive("watcher", signal, async () => {
    await scan(importPath, collectionUuid, signal)
  })
}

export async function runImportPathChangeScan(
  importPath: string,
  collectionUuid: UUID | null,
  changes: ImportPathChange[],
  signal: AbortSignal,
) {
  await runExclusive("watcher", signal, async () => {
    await scanChangedPaths(importPath, collectionUuid, changes, signal)
  })
}

export async function runAllImportScans(signal: AbortSignal) {
  await runExclusive("manual-imports", signal, async () => {
    await runAllImportScansUnlocked(signal)
  })
}

export async function runExistingBooksScan(
  signal: AbortSignal,
  options?: ScanOptions,
) {
  await runExclusive("manual-existing", signal, async () => {
    await scanExistingBooks(signal, undefined, options)
  })
}

export async function runExistingBookScan(
  bookUuid: UUID,
  signal: AbortSignal,
  options?: ScanOptions,
) {
  await runExclusive("manual-existing", signal, async () => {
    const book = await getBook(bookUuid)
    if (!book) {
      logger.error(`Book ${bookUuid} not found`)
      return
    }
    await scanExistingBooks(signal, [bookUuid], options)
  })
}

export async function runFullScan(signal: AbortSignal, options?: ScanOptions) {
  await runExclusive("manual-full", signal, async () => {
    await runAllImportScansUnlocked(signal)

    await scanExistingBooks(signal, undefined, options)
    if (signal.aborted) {
      return
    }
  })
}

export async function runScheduledFullScan(signal: AbortSignal) {
  await runExclusive("scheduled", signal, async () => {
    logger.info("Running scheduled full scan")
    await scanExistingBooks(signal)
    if (signal.aborted) {
      return
    }
    await runAllImportScansUnlocked(signal)
  })
}
