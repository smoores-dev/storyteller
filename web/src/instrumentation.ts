export async function register() {
  if (process.env["NEXT_RUNTIME"] === "edge") {
    return
  }

  // this makes sure env is validated at startup
  // we don't import it "normally" as this may cause issues in the edge runtime if end up
  // adding extra imports to env.ts
  const { env } = await import("@/env")
  const { listen } = await import("./assets/autoimport/listen")
  const { logger } = await import("./logging")
  const { migrate } = await import("./database/migrate")
  const { getQueuedBooks } = await import("./database/books")
  const { startProcessing } = await import("./work/distributor")
  const { getReadiumService } = await import("./services/readiumService")

  logger.debug("Debug logging enabled")

  try {
    await migrate()
  } catch (err) {
    logger.error("Failed to run database migrations — Aborting startup")
    throw err
  }
  try {
    await listen()
  } catch (err) {
    logger.error("Failed to initiate filesystem listener")
    logger.error(err)
  }

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

  if (!env.ENABLE_WEB_READER) {
    return
  }

  try {
    const readiumService = getReadiumService()
    await readiumService.start()
    logger.info("Readium service initialized successfully")
  } catch (err) {
    logger.error("Failed to start Readium service")
    logger.error(err)
  }
}
