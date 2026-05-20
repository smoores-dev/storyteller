import { stat } from "node:fs/promises"
import { dirname, extname, relative, resolve } from "node:path"

import { AsyncMutex } from "@esfx/async-mutex"
import watcher from "@parcel/watcher"

import { isInsideInternalDirectory } from "@/assets/library/internalDirs"
import { scan } from "@/assets/library/scanner/scan"
import {
  getWatcherOptions,
  readSnapshotChanges,
  writeWatcherSnapshot,
} from "@/assets/library/scanner/watcher-snapshot"
import { isSuppressed } from "@/assets/library/scanner/write-intent"
import { isAudioFile } from "@/audio"
import {
  type ImportRuleWithCollections,
  getWatchRules,
} from "@/database/importRules"
import { type ImportMode } from "@/database/settingsTypes"
import { ASSETS_DIR } from "@/directories"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

function standardFilter(path: string): boolean {
  return (
    !isInsideInternalDirectory(path) &&
    (path.endsWith(".epub") || isAudioFile(path)) &&
    !/\.watchman-cookie/.test(path)
  )
}

const assetRegex = /[^/]*\/(text|aligned|audio)\//

type WatcherEvent = { path: string; type: "create" | "update" | "delete" }

type ControllerKey = UUID | "rules" | "assets"

/**
 * bucket a list of watcher events by the folder that *directly* contains
 * each event path
 */
function bucketByBookFolder(
  importRoot: string,
  events: WatcherEvent[],
): Set<string> {
  const folders = new Set<string>()
  const normalizedRoot = resolve(importRoot)

  for (const event of events) {
    const filepath = resolve(event.path)
    const folder = extname(filepath) ? dirname(filepath) : filepath
    const rel = relative(normalizedRoot, folder)
    // skip anything that resolves outside the watch root
    // (this shouldn't happen, but in case...)
    if (rel.startsWith("..")) continue
    folders.add(folder)
  }

  return folders
}

export class Watcher {
  private readonly entryLocks = new Map<string, AsyncMutex>()
  private readonly controllers = new Map<ControllerKey, AbortController>()
  private started = false

  async start(): Promise<void> {
    if (this.started) {
      logger.debug("Watcher already started")
      return
    }

    this.started = true

    const watchRules = await getWatchRules()
    this.startWatchRules(watchRules)

    const assetController = new AbortController()
    this.controllers.set("assets", assetController)
    this.startWatcher([], ASSETS_DIR, assetController, undefined, (path) =>
      assetRegex.test(path),
    )

    return
  }

  private startWatchRules(rules: ImportRuleWithCollections[]) {
    const rulesController = new AbortController()
    this.controllers.set("rules", rulesController)

    for (const rule of rules) {
      this.startWatcher(
        rule.collections.map((c) => c.uuid),
        rule.path,
        rulesController,
        rule.importMode as ImportMode | null,
      )
    }
  }

  async reload(): Promise<void> {
    const rulesController = this.controllers.get("rules")
    if (rulesController) {
      rulesController.abort()
      this.controllers.delete("rules")
    }

    this.entryLocks.clear()

    const watchRules = await getWatchRules()
    this.startWatchRules(watchRules)
  }

  remove(uuid: UUID) {
    const controller = this.controllers.get(uuid)
    if (!controller) return

    controller.abort()
    this.controllers.delete(uuid)
  }

  stop(): Promise<void> {
    for (const controller of this.controllers.values()) {
      controller.abort()
    }

    this.controllers.clear()
    this.entryLocks.clear()
    this.started = false
    return Promise.resolve()
  }

  private startWatcher(
    collections: UUID[],
    importPath: string,
    controller: AbortController,
    importMode?: ImportMode | null,
    filter?: (path: string) => boolean,
  ) {
    let entryLock = this.entryLocks.get(importPath)
    if (!entryLock) {
      entryLock = new AsyncMutex()
      this.entryLocks.set(importPath, entryLock)
    }

    if (!entryLock.tryLock()) {
      logger.debug({ msg: "entryLock already locked", importPath })
      return
    }

    const scanLock = new AsyncMutex()
    const pendingEvents: WatcherEvent[] = []
    let flushTimer: NodeJS.Timeout | null = null
    let closed = false
    let subscription: Awaited<ReturnType<typeof watcher.subscribe>> | null =
      null

    const closeWatcher = async () => {
      if (closed) return

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
      if (controller.signal.aborted || closed || flushTimer) return

      flushTimer = setTimeout(() => {
        flushTimer = null
        void flushEvents()
      }, delayMs)
      flushTimer.unref()
    }

    const queueEvents = (events: WatcherEvent[]) => {
      if (!events.length) return
      pendingEvents.push(...events)
      scheduleFlush(750)
    }

    const flushEvents = async () => {
      if (controller.signal.aborted || closed || !pendingEvents.length) return

      await scanLock.lock()
      const batch = pendingEvents.splice(0, pendingEvents.length)

      try {
        const folders = [...bucketByBookFolder(importPath, batch)]
        if (folders.length) {
          await scan({
            source: "watcher",
            request: {
              kind: "folders",
              folders,
              collections,
            },
            options: { concurrency: 2, importMode: importMode ?? undefined },
            signal: controller.signal,
          })
        }
        await writeWatcherSnapshot(importPath)
      } catch (error) {
        logger.error({
          msg: "Watcher scan failed for changed folders",
          importPath,
          err: error,
        })
      } finally {
        scanLock.unlock()
      }

      if (pendingEvents.length) scheduleFlush(250)
    }

    const handleEvents = (events: WatcherEvent[]) => {
      if (controller.signal.aborted || closed) return

      const relevant = events.filter(
        (event) =>
          !isSuppressed(event.path) &&
          standardFilter(event.path) &&
          (filter ? filter(event.path) : true),
      )

      if (!relevant.length) {
        logger.debug({
          msg: "No relevant changes found",
          importPath,
          events,
        })
        return
      }

      logger.debug({
        msg: "Relevant changes found",
        importPath,
        events: relevant,
      })
      queueEvents(relevant)
    }

    const bootstrapWatcher = async () => {
      const startup = await readSnapshotChanges(importPath)
      if (controller.signal.aborted || closed) return

      if (!startup.snapshotExists) {
        await scan({
          source: "watcher",
          request: {
            kind: "roots",
            roots: [
              {
                path: importPath,
                collections,
                importMode: importMode ?? undefined,
              },
            ],
          },
          options: { concurrency: 2 },
          signal: controller.signal,
        })
        await writeWatcherSnapshot(importPath)
        return
      }

      if (!startup.changes.length) return

      queueEvents(startup.changes)
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
        const stats = await stat(importPath).catch(() => null)
        if (!stats?.isDirectory()) {
          logger.warn({
            msg: "Import path does not exist or is not a directory, skipping watcher",
            importPath,
          })
          await closeWatcher()
          return
        }

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

  [Symbol.asyncDispose]() {
    return this.stop()
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
