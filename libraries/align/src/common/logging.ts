import { mkdirSync } from "node:fs"
import { join } from "node:path"

import pino, { type LevelWithSilent } from "pino"
import PinoPretty from "pino-pretty"

function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function getLogDir() {
  const dataDir = process.env["STORYTELLER_DATA_DIR"]
  if (!dataDir) return null

  return join(dataDir, "logs")
}

export function createLogger(level: LevelWithSilent = "info") {
  const prettyStream = PinoPretty({
    ignore: "pid,hostname",
    translateTime: "SYS:standard",
  })

  const logDir = getLogDir()
  if (!logDir) {
    return pino({ level }, prettyStream)
  }

  try {
    mkdirSync(logDir, { recursive: true })
  } catch {
    return pino({ level }, prettyStream)
  }

  const filePath = join(logDir, `storyteller-${todayDateString()}.log`)

  const fileStream = pino.destination({
    dest: filePath,
    mkdir: true,
    sync: false,
  })

  return pino(
    { level },
    pino.multistream([
      { stream: prettyStream, level },
      { stream: fileStream, level },
    ]),
  )
}
