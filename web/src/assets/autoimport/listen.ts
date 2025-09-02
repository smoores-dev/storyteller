import { watch } from "node:fs"

import { AsyncMutex } from "@esfx/async-mutex"
import debounce from "debounce"

import { getCollection, getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { scan } from "./scan"

const entryLocks = new Map<string, AsyncMutex>()

function startWatcher(
  collection: UUID | null,
  importPath: string,
  controller: AbortController,
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

  // This will always succeed, we just created the lock
  scanLock.tryLock()

  scan(importPath, collection, controller.signal)
    .catch((e: unknown) => {
      logger.error(
        `Encountered an error scanning for new book files in ${importPath}`,
      )
      logger.error(e)
    })
    .finally(() => {
      scanLock.unlock()
    })

  watch(
    importPath,
    { recursive: true, signal: controller.signal },
    debounce(async () => {
      if (controller.signal.aborted) {
        logger.info("Detected a change, but scanning is aborted. Ignoring.")
        return
      }

      logger.info(
        `Detected a change in ${importPath}, scanning for new book files...`,
      )

      await scanLock.lock()

      scan(importPath, collection, controller.signal)
        .catch((e: unknown) => {
          logger.error(
            `Encountered an error scanning for new book files in ${importPath}`,
          )
          logger.error(e)
        })
        .finally(() => {
          scanLock.unlock()
        })
    }, 5_000),
  )
    .on("close", () => {
      entryLock.unlock()
    })
    .on("error", () => {
      entryLock.unlock()
    })
}

let rootController = new AbortController()
const controllers = new Map<UUID, AbortController>()

export async function listen() {
  const collections = await getCollections()

  const rootImportPath = await getSetting("importPath")

  if (rootImportPath) {
    logger.info(`Starting new watcher for root import path, ${rootImportPath}`)
    startWatcher(null, rootImportPath, rootController)
  }

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
}

export async function update(uuid: UUID | null) {
  if (!uuid) {
    const rootImportPath = await getSetting("importPath")
    logger.info("Cancelling watcher for root import path")
    rootController.abort()
    rootController = new AbortController()

    if (rootImportPath) {
      logger.info(
        `Starting new watcher for root import path, ${rootImportPath}`,
      )
      startWatcher(null, rootImportPath, rootController)
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
