export async function register() {
  if (process.env["NEXT_RUNTIME"] === "edge") {
    return
  }

  // this makes sure env is validated at startup
  // we don't import it "normally" as this may cause issues in the edge runtime if end up
  // adding extra imports to env.ts
  await import("@/env")
  const { getWatcher } = await import(
    "./assets/library/scanner/triggers/watcher"
  )
  const { getScheduler } = await import(
    "./assets/library/scanner/triggers/scheduler"
  )
  const { logger } = await import("./logging")
  const { migrate } = await import("./database/migrate")
  const { syncChangelog } = await import("./database/changelog")
  const { getQueuedBooks } = await import("./database/books")
  const { startProcessing } = await import("./work/distributor")
  const { getReadiumService } = await import("./services/readiumService")

  logger.debug("Debug logging enabled")

  try {
    const readiumService = getReadiumService()
    await readiumService.start()
    logger.info("Readium service initialized successfully")
  } catch (err) {
    logger.error(
      "Failed to start Readium service: this will cause problems with the web reader and scanner",
    )
    logger.error(err)
  }

  try {
    await migrate()
  } catch (err) {
    logger.error("Failed to run database migrations — Aborting startup")
    throw err
  }

  try {
    const { syncConfigFileImportPaths } = await import("./database/settings")
    await syncConfigFileImportPaths()
  } catch (err) {
    logger.error("Failed to sync config file import paths")
    logger.error(err)
  }

  try {
    await getWatcher().start()
    await getScheduler().refresh()
  } catch (err) {
    logger.error("Failed to initiate library watcher services")
    logger.error(err)
  }

  try {
    await syncChangelog()
  } catch (err) {
    logger.error("Failed to sync changelog from GitLab")
    logger.error(err)
  }

  const cron = await import("node-cron")
  cron.schedule("*/30 * * * *", () => {
    syncChangelog().catch((err: unknown) => {
      logger.error({ msg: "Periodic changelog sync failed", err })
    })
  })

  try {
    const queue = await getQueuedBooks()
    if (queue.length) {
      logger.info("Restoring processing queue...")
    }
    for (const book of queue) {
      logger.info(`Adding ${book.title} to the queue`)
      void startProcessing(book.uuid, book.readaloud?.restartPending || false)
    }
  } catch (err) {
    logger.error("Failed to restart processing queue")
    logger.error(err)
  }
}
