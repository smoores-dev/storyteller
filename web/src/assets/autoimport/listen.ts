import { getCollection, getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import { UUID } from "@/uuid"
import { watch } from "node:fs"
import debounce from "debounce"
import { scan } from "./scan"

function startWatcher(
  collection: UUID | null,
  importPath: string,
  controller: AbortController,
) {
  scan(importPath, collection).catch((e: unknown) => {
    logger.error(
      `Encountered an error scanning for new book files in ${importPath}`,
    )
    logger.error(e)
  })

  watch(
    importPath,
    { recursive: true, signal: controller.signal },
    debounce(() => {
      logger.info(
        `Detected a change in ${importPath}, scanning for new book files...`,
      )
      scan(importPath, collection).catch((e: unknown) => {
        logger.error(
          `Encountered an error scanning for new book files in ${importPath}`,
        )
        logger.error(e)
      })
    }, 5_000),
  )
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
    logger.info("Cancelling watcher for root import path")
    rootController.abort()
    rootController = new AbortController()

    const rootImportPath = await getSetting("importPath")
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
