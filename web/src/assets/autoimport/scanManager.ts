import { AsyncMutex } from "@esfx/async-mutex"

import { getBook } from "@/database/books"
import { getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { scan } from "./scan"
import { scanExistingBooks } from "./scanExisting"

type ScanSource = "watcher" | "manual-existing" | "manual-imports" | "scheduled"

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
  rootImportPath: string | null,
  collections: Awaited<ReturnType<typeof getCollections>>,
) {
  const targets: { importPath: string; collectionUuid: UUID | null }[] = []

  if (rootImportPath) {
    targets.push({ importPath: rootImportPath, collectionUuid: null })
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

export async function runAllImportScans(signal: AbortSignal) {
  await runExclusive("manual-imports", signal, async () => {
    const [rootImportPath, collections] = await Promise.all([
      getSetting("importPath"),
      getCollections(),
    ])
    const targets = getImportTargets(rootImportPath, collections)

    for (const target of targets) {
      if (signal.aborted) {
        return
      }

      await scan(target.importPath, target.collectionUuid, signal)
    }
  })
}

export async function runExistingBooksScan(signal: AbortSignal) {
  await runExclusive("manual-existing", signal, async () => {
    await scanExistingBooks(signal)
  })
}

export async function runExistingBookScan(bookUuid: UUID, signal: AbortSignal) {
  await runExclusive("manual-existing", signal, async () => {
    const book = await getBook(bookUuid)
    if (!book) {
      logger.error(`Book ${bookUuid} not found`)
      return
    }
    await scanExistingBooks(signal, [bookUuid])
  })
}

export async function runScheduledExistingBooksScan(signal: AbortSignal) {
  await runExclusive("scheduled", signal, async () => {
    logger.info("Running scheduled existing-book scan")
    await scanExistingBooks(signal)
  })
}
