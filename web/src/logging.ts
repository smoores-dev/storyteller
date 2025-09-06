import pino, { type Level } from "pino"
import PinoPretty from "pino-pretty"

export const logger = pino(
  {
    level:
      (process.env["STORYTELLER_LOG_LEVEL"] as Level | undefined) ?? "info",
  },
  PinoPretty({
    ignore: "pid,hostname",
    translateTime: "SYS:standard",
  }),
)
