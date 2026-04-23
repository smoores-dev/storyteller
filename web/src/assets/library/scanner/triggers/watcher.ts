import { AsyncMutex } from "@esfx/async-mutex"
import watcher from "@parcel/watcher"

import { type ImportPathChange } from "@/assets/library/changes"
import { scan } from "@/assets/library/scanner/scan"
import {
  getWatcherOptions,
  readSnapshotChanges,
  writeWatcherSnapshot,
} from "@/assets/library/scanner/watcher-snapshot"
import { isSuppressed } from "@/assets/library/scanner/write-intent"
import { isAudioFile } from "@/audio"
import { getCollection, getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { ASSETS_DIR } from "@/directories"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

function standardFilter(path: string): boolean {
  return path.endsWith(".epub") || isAudioFile(path)
}

type ControllerKey = UUID | "root" | "assets"

export class Watcher {
  private readonly entryLocks = new Map<string, AsyncMutex>()
  private readonly controllers = new Map<ControllerKey, AbortController>()
  private readonly collectionImportPaths = new Map<UUID, string>()
  private started = false

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true

    const [collections, rootImportPaths] = await Promise.all([
      getCollections(),
      getSetting("importPath"),
    ])

    const rootController = new AbortController()
    this.controllers.set("root", rootController)

    if (rootImportPaths) {
      for (const importPath of rootImportPaths) {
        this.startWatcher(null, importPath, rootController)
      }
    }

    for (const collection of collections) {
      if (!collection.importPath) {
        continue
      }

      const controller = new AbortController()
      this.controllers.set(collection.uuid, controller)
      this.collectionImportPaths.set(collection.uuid, collection.importPath)
      this.startWatcher(collection.uuid, collection.importPath, controller)
    }

    const assetController = new AbortController()
    this.controllers.set("assets", assetController)
    const assetRegex = /[^/]*\/(text|aligned|audio)\//
    this.startWatcher(null, ASSETS_DIR, assetController, (path) =>
      assetRegex.test(path),
    )
  }

  async update(uuid: UUID | null): Promise<void> {
    if (!uuid) {
      const rootImportPaths = await getSetting("importPath")
      const existingRootController = this.controllers.get("root")
      if (existingRootController) {
        existingRootController.abort()
      }

      const rootController = new AbortController()
      this.controllers.set("root", rootController)

      if (rootImportPaths) {
        for (const importPath of rootImportPaths) {
          this.startWatcher(null, importPath, rootController)
        }
      }
      return
    }

    const previousImportPath = this.collectionImportPaths.get(uuid)
    if (previousImportPath) {
      this.entryLocks.delete(previousImportPath)
      this.collectionImportPaths.delete(uuid)
    }

    const existingController = this.controllers.get(uuid)
    if (existingController) {
      existingController.abort()
      this.controllers.delete(uuid)
    }

    const collection = await getCollection(uuid)
    if (!collection.importPath) {
      return
    }

    const controller = new AbortController()
    this.controllers.set(uuid, controller)
    this.collectionImportPaths.set(uuid, collection.importPath)
    this.startWatcher(uuid, collection.importPath, controller)
  }

  remove(uuid: UUID): Promise<void> {
    const previousImportPath = this.collectionImportPaths.get(uuid)
    if (previousImportPath) {
      this.entryLocks.delete(previousImportPath)
      this.collectionImportPaths.delete(uuid)
    }

    const controller = this.controllers.get(uuid)
    if (!controller) {
      return Promise.resolve()
    }

    controller.abort()
    this.controllers.delete(uuid)
    return Promise.resolve()
  }

  stop(): Promise<void> {
    for (const controller of this.controllers.values()) {
      controller.abort()
    }

    this.controllers.clear()
    this.collectionImportPaths.clear()
    this.entryLocks.clear()
    this.started = false
    return Promise.resolve()
  }

  private startWatcher(
    collection: UUID | null,
    importPath: string,
    controller: AbortController,
    filter?: (path: string) => boolean,
  ) {
    let entryLock = this.entryLocks.get(importPath)
    if (!entryLock) {
      entryLock = new AsyncMutex()
      this.entryLocks.set(importPath, entryLock)
    }

    if (!entryLock.tryLock()) {
      return
    }

    const scanLock = new AsyncMutex()
    const pendingChanges: ImportPathChange[] = []
    let flushTimer: NodeJS.Timeout | null = null
    let closed = false
    let subscription: Awaited<ReturnType<typeof watcher.subscribe>> | null =
      null

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
          logger.error({
            msg: "Failed to unsubscribe watcher",
            importPath,
            err: error,
          })
        }
        subscription = null
      }

      if (entryLock.isLocked) {
        entryLock.unlock()
      }

      this.entryLocks.delete(importPath)
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
      scheduleFlush(750)
    }

    const flushChanges = async () => {
      if (controller.signal.aborted || closed || !pendingChanges.length) {
        return
      }

      await scanLock.lock()
      const batch = pendingChanges.splice(0, pendingChanges.length)

      try {
        await scan({
          source: "watcher",
          tasks: [
            { kind: "changed-paths", importPath, collection, changes: batch },
          ],
          options: { concurrency: 2 },
          signal: controller.signal,
        })
        await writeWatcherSnapshot(importPath)
      } catch (error) {
        logger.error({
          msg: "Watcher scan failed for changed paths",
          importPath,
          err: error,
        })
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

      queueChanges(relevantChanges)
    }

    const bootstrapWatcher = async () => {
      const startup = await readSnapshotChanges(importPath)
      if (controller.signal.aborted || closed) {
        return
      }

      if (!startup.snapshotExists) {
        await scan({
          source: "watcher",
          tasks: [
            { kind: "import-path", importPath, collection },
            { kind: "existing-books" },
          ],
          options: { concurrency: 2 },
          signal: controller.signal,
        })
        await writeWatcherSnapshot(importPath)
        return
      }

      if (!startup.changes.length) {
        return
      }

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
              logger.error({
                msg: "Watcher subscription error",
                importPath,
                err: error,
              })
              return
            }

            handleEvents(events)
          },
          getWatcherOptions(),
        )

        await bootstrapWatcher()
      } catch (error) {
        logger.error({
          msg: "Failed to start watcher",
          importPath,
          err: error,
        })
        await closeWatcher()
      }
    })()
  }
}

declare global {
  // eslint-disable-next-line no-var
  var libraryWatcherInstance: Watcher | undefined
}

export function getWatcher(): Watcher {
  if (!globalThis.libraryWatcherInstance) {
    globalThis.libraryWatcherInstance = new Watcher()
  }

  return globalThis.libraryWatcherInstance
}
