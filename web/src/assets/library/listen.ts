import { AsyncMutex } from "@esfx/async-mutex"
import watcher from "@parcel/watcher"

import { isAudioFile } from "@/audio"
import { getCollection, getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { ASSETS_DIR } from "@/directories"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { type ImportPathChange, scan, scanChangedPaths } from "./scan"
import { runExclusive } from "./scanManager"
import {
  getWatcherOptions,
  readSnapshotChanges,
  writeWatcherSnapshot,
} from "./watcherSnapshot"
import { isSuppressed } from "./writeIntent"

const entryLocks = new Map<string, AsyncMutex>()

function standardFilter(path: string): boolean {
  return path.endsWith(".epub") || isAudioFile(path)
}

function startWatcher(
  collection: UUID | null,
  importPath: string,
  controller: AbortController,
  filter?: (path: string) => boolean,
) {
  let entryLock = entryLocks.get(importPath)

  if (!entryLock) {
    entryLock = new AsyncMutex()
    entryLocks.set(importPath, entryLock)
  }

  if (!entryLock.tryLock()) {
    return
  }

  const scanLock = new AsyncMutex()
  const pendingChanges: ImportPathChange[] = []
  let flushTimer: NodeJS.Timeout | null = null
  let closed = false
  let subscription: Awaited<ReturnType<typeof watcher.subscribe>> | null = null

  const closeWatcher = async () => {
    if (closed) {
      return
    }
    closed = true
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (subscription) {
      try {
        await subscription.unsubscribe()
      } catch (error) {
        logger.error(`Failed to unsubscribe watcher for ${importPath}`)
        logger.error(error)
      }
      subscription = null
    }
    if (entryLock.isLocked) {
      entryLock.unlock()
    }
  }

  const scheduleFlush = (delayMs: number) => {
    if (controller.signal.aborted || closed || flushTimer) {
      return
    }
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flushChanges()
    }, delayMs)
    flushTimer.unref()
  }

  const queueChanges = (changes: ImportPathChange[]) => {
    if (!changes.length) {
      return
    }
    pendingChanges.push(...changes)
    if (scanLock.isLocked) {
      logger.debug(
        `Queuing ${changes.length} change(s) in ${importPath} while scan is running`,
      )
    }
    scheduleFlush(750)
  }

  const flushChanges = async () => {
    if (controller.signal.aborted || closed) {
      return
    }
    if (!pendingChanges.length) {
      return
    }

    await scanLock.lock()
    const batch = pendingChanges.splice(0, pendingChanges.length)
    logger.info(`Scanning ${batch.length} change(s) in ${importPath}`)
    try {
      await runExclusive("watcher", controller.signal, async () => {
        await scanChangedPaths(importPath, collection, batch, controller.signal)
      })
      await writeWatcherSnapshot(importPath)
    } catch (error) {
      logger.error(
        `Encountered an error scanning changed files in import path ${importPath}`,
      )
      logger.error(error)
    } finally {
      scanLock.unlock()
    }

    if (pendingChanges.length) {
      scheduleFlush(250)
    }
  }

  const handleEvents = (
    events: { path: string; type: ImportPathChange["type"] }[],
  ) => {
    if (controller.signal.aborted || closed) {
      logger.debug("Detected a change, but scanning is aborted. Ignoring.")
      return
    }

    const relevantChanges = events
      .filter(
        (event) =>
          !isSuppressed(event.path) &&
          standardFilter(event.path) &&
          (filter ? filter(event.path) : true),
      )
      .map((event) => ({
        path: event.path,
        type: event.type,
      }))
    if (!relevantChanges.length) {
      return
    }

    logger.debug(
      `Detected ${relevantChanges.length} change event(s) in ${importPath}`,
    )
    queueChanges(relevantChanges)
  }

  const bootstrapWatcher = async () => {
    const startup = await readSnapshotChanges(importPath)
    if (controller.signal.aborted || closed) {
      return
    }

    if (!startup.snapshotExists) {
      logger.info(
        `No snapshot found for ${importPath}; running one full import-path scan to establish baseline.`,
      )
      await runExclusive("watcher", controller.signal, async () => {
        await scan(importPath, collection, controller.signal)
      })
      await writeWatcherSnapshot(importPath)
      return
    }

    if (!startup.changes.length) {
      logger.debug(`No pending changes from snapshot for ${importPath}`)
      return
    }

    logger.info(
      `Recovered ${startup.changes.length} pending change event(s) for ${importPath} from snapshot.`,
    )
    queueChanges(startup.changes)
    scheduleFlush(0)
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      void closeWatcher()
    },
    { once: true },
  )

  void (async () => {
    try {
      subscription = await watcher.subscribe(
        importPath,
        (error, events) => {
          if (error) {
            logger.error(`Watcher subscription error for ${importPath}`)
            logger.error(error)
            return
          }
          handleEvents(events)
        },
        getWatcherOptions(),
      )
      await bootstrapWatcher()
    } catch (error) {
      logger.error(`Failed to start watcher for import path ${importPath}`)
      logger.error(error)
      await closeWatcher()
    }
  })()
}

let rootController = new AbortController()
const assetController = new AbortController()
const controllers = new Map<UUID, AbortController>()

export async function listen() {
  const collections = await getCollections()

  const rootImportPaths = await getSetting("importPath")

  // watch root import paths
  if (rootImportPaths) {
    for (const importPath of rootImportPaths) {
      logger.info(`Starting new watcher for root import path, ${importPath}`)
      startWatcher(null, importPath, rootController)
    }
  }
  // watch collections
  for (const collection of collections) {
    if (collection.importPath) {
      if (!controllers.has(collection.uuid)) {
        controllers.set(collection.uuid, new AbortController())
      }
      logger.info(
        `Starting new watcher for collection ${collection.name} at ${collection.importPath}`,
      )
      startWatcher(
        collection.uuid,
        collection.importPath,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        controllers.get(collection.uuid)!,
      )
    }
  }

  // only match files in the text, aligned, and audio directories
  const assetRegex = /[^/]*\/(text|aligned|audio)\//

  // watch assets
  startWatcher(null, ASSETS_DIR, assetController, (path) => {
    return assetRegex.test(path)
  })
}

export async function update(uuid: UUID | null) {
  if (!uuid) {
    const rootImportPaths = await getSetting("importPath")
    logger.info("Cancelling watchers for root import paths")
    rootController.abort()
    rootController = new AbortController()

    if (rootImportPaths) {
      for (const importPath of rootImportPaths) {
        logger.info(`Starting new watcher for root import path, ${importPath}`)
        startWatcher(null, importPath, rootController)
      }
    }
  } else {
    const collection = await getCollection(uuid)
    logger.info(`Cancelling watcher for collection ${collection.name}`)
    const controller = controllers.get(uuid)
    if (controller) {
      controller.abort()
    }
    controllers.set(uuid, new AbortController())
    try {
      if (collection.importPath) {
        logger.info(
          `Starting new watcher for collection ${collection.name} at ${collection.importPath}`,
        )

        startWatcher(
          collection.uuid,
          collection.importPath,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          controllers.get(uuid)!,
        )
      }
    } catch {
      // pass
    }
  }
}
