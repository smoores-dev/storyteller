import { stat } from "node:fs/promises"

import { AsyncMutex } from "@esfx/async-mutex"
import watcher from "@parcel/watcher"

import { type ImportPathChange } from "@/assets/library/changes"
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

type ControllerKey = UUID | "rules" | "assets"

export class Watcher {
  private readonly entryLocks = new Map<string, AsyncMutex>()
  private readonly controllers = new Map<ControllerKey, AbortController>()
  private started = false

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true

    const watchRules = await getWatchRules()
    this.startWatchRules(watchRules)

    const assetController = new AbortController()
    this.controllers.set("assets", assetController)
    this.startWatcher([], ASSETS_DIR, assetController, (path) =>
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
        undefined,
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
    filter?: (path: string) => boolean,
    importMode?: ImportMode | null,
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
            {
              kind: "changed-paths",
              importPath,
              importMode,
              collections,
              changes: batch,
            },
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
        logger.debug({
          msg: "No relevant changes found",
          importPath,
          changes: events,
        })
        return
      }

      logger.debug({
        msg: "Relevant changes found",
        importPath,
        changes: relevantChanges,
      })
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
            { kind: "import-path", importPath, collections },
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
