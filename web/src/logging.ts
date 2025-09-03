import pino from "pino"
import PinoPretty from "pino-pretty"

export const logger = pino(
  PinoPretty({
    ignore: "pid,hostname",
    translateTime: "SYS:standard",
  }),
)
