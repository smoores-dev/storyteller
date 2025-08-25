export async function register() {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    const { listen } = await import("./assets/autoimport/listen")
    const { logger } = await import("./logging")
    const { migrate } = await import("./database/migrate")

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
  }
}
