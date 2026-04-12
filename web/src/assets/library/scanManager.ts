import { AsyncMutex } from "@esfx/async-mutex"

import { getBook } from "@/database/books"
import { getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { type ImportPathChange, scan, scanChangedPaths } from "./scan"
import { scanExistingBooks } from "./scanExisting"
import { type ScanOptions } from "./scanner"

type ScanSource = "watcher" | "manual" | "scheduled"

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

async function runImportScans(signal: AbortSignal): Promise<Set<UUID>> {
  const [rootImportPaths, collections] = await Promise.all([
    getSetting("importPath"),
    getCollections(),
  ])
  const targets = getImportTargets(rootImportPaths, collections)

  const scannedUuids = new Set<UUID>()
  for (const target of targets) {
    if (signal.aborted) {
      return scannedUuids
    }

    const uuids = await scan(target.importPath, target.collectionUuid, signal)
    for (const uuid of uuids) {
      scannedUuids.add(uuid)
    }
  }

  return scannedUuids
}

export function getScanState(): ScanState {
  return { ...state }
}

export async function runWatcherScan(
  importPath: string,
  collectionUuid: UUID | null,
  signal: AbortSignal,
) {
  await runExclusive("watcher", signal, async () => {
    await scan(importPath, collectionUuid, signal)
  })
}

export async function runWatcherChangeScan(
  importPath: string,
  collectionUuid: UUID | null,
  changes: ImportPathChange[],
  signal: AbortSignal,
) {
  await runExclusive("watcher", signal, async () => {
    await scanChangedPaths(importPath, collectionUuid, changes, signal)
  })
}

export async function runLibraryScan(
  signal: AbortSignal,
  options?: ScanOptions,
) {
  await runExclusive("manual", signal, async () => {
    const scannedUuids = await runImportScans(signal)
    if (signal.aborted) {
      return
    }

    await scanExistingBooks(signal, {
      ...(options && { scanOptions: options }),
      excludeBookUuids: scannedUuids,
    })
  })
}

export async function runSingleBookScan(
  bookUuid: UUID,
  signal: AbortSignal,
  options?: ScanOptions,
) {
  await runExclusive("manual", signal, async () => {
    const book = await getBook(bookUuid)
    if (!book) {
      logger.error(`Book ${bookUuid} not found`)
      return
    }

    await scanExistingBooks(signal, {
      bookUuids: [bookUuid],
      ...(options && { scanOptions: options }),
    })
  })
}

export async function runScheduledScan(signal: AbortSignal) {
  await runExclusive("scheduled", signal, async () => {
    logger.info("Running scheduled library scan")

    const scannedUuids = await runImportScans(signal)
    if (signal.aborted) {
      return
    }

    await scanExistingBooks(signal, { excludeBookUuids: scannedUuids })
  })
}
