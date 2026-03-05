import pino, { type LevelWithSilent } from "pino"
import PinoPretty from "pino-pretty"

export function createLogger(level: LevelWithSilent = "info") {
  return pino(
    { level },
    PinoPretty({ ignore: "pid,hostname", translateTime: "SYS:standard" }),
  )
}
