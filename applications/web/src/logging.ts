import pino from "pino"

import { env } from "./env"

export const logger = pino(
  { level: env.STORYTELLER_LOG_LEVEL },
  pino.destination({ fd: 1, sync: true }),
)

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception")
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled rejection")
})
