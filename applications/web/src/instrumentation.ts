export async function register() {
  if (process.env["NEXT_RUNTIME"] === "edge") {
    return
  }

  // this makes sure env is validated at startup
  // we don't import it "normally" as this may cause issues in the edge runtime if end up
  // adding extra imports to env.ts
  await import("@/env")

  try {
    const { initScratchDir } = await import("./scratch")
    await initScratchDir()
  } catch (err) {
    const { logger } = await import("./logging")
    logger.error({
      msg: "Failed to initialize the scratch directory, temporary files will use the system temp directory",
      err,
    })
  }

  const { getWatcher: getWatcher } = await import(
    "./assets/library/scanner/triggers/watcher"
  )
  const { getScheduler: getScheduler } = await import(
    "./assets/library/scanner/triggers/scheduler"
  )
  const { logger } = await import("./logging")
  const { migrate } = await import("./database/migrate")
  const { syncChangelog } = await import("./database/changelog")
  const { getQueuedBooks } = await import("./database/books")
  const { startProcessing, pump } = await import("./work/distributor")
  const { getReadiumService } = await import("./services/readiumService")
  const { env } = await import("./env")
  const { startLogRetention } = await import("./logRetention")

  startLogRetention()

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
    await getWatcher().start()
    await getScheduler().refresh()
  } catch (err) {
    logger.error("Failed to initiate library watcher services")
    logger.error(err)
  }

  try {
    const { ensureDataDirAnchor } = await import("./database/pathRewrite")
    await ensureDataDirAnchor()
    const { getBackupScheduler } = await import("./backupScheduler")
    await getBackupScheduler().refresh()
  } catch (err) {
    logger.error("Failed to initiate backup scheduler")
    logger.error(err)
  }

  try {
    if (env.STORYTELLER_SYNC_CHANGELOG) {
      await syncChangelog()
    }
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
      logger.warn({
        msg: `Processing ${book.title} was not automatically restarted, you should restart it manually`,
      })
      // logger.info(`Adding ${book.title} to the queue`)
      // void startProcessing(book.uuid, book.readaloud?.restartPending || false)
    }
    if (queue.length) {
      void pump()
    }
  } catch (err) {
    logger.error("Failed to restart processing queue")
    logger.error(err)
  }

  logger.info("Starting app")
}
