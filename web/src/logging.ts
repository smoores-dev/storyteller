import pino from "pino"
import PinoPretty from "pino-pretty"

import { env } from "@/env"

export const logger = pino(
  {
    level: env.STORYTELLER_LOG_LEVEL,
  },
  PinoPretty({
    ignore: "pid,hostname",
    translateTime: "SYS:standard",
  }),
)
