import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFile, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { scratchPath } from "@storyteller-platform/fs"

const here = dirname(fileURLToPath(import.meta.url))
const JAR = join(here, "vendors", "epubcheck-5.3.0", "epubcheck.jar")

export interface Location {
  url: { hierachical: boolean; opaque: boolean }
  path: string
  line: number
  column: number
  context: string | null
}

export interface Message {
  ID: string
  severity: "FATAL" | "ERROR" | "WARNING" | "INFO" | "USAGE"
  message: string
  additionalLocations: number
  locations: Location[]
}

export interface Report {
  messages: Message[]
}

export async function epubcheck(epubFile: string): Promise<Report> {
  const output = scratchPath(`epubcheck-${randomUUID()}.json`)
  const execFilePromise = promisify(execFile)

  try {
    await execFilePromise("java", [
      "-jar",
      JAR,
      "--json",
      output,
      epubFile,
    ]).catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message.includes("Check finished with errors")
      ) {
        // dont throw, just let the caller handle it
        return
      }
      throw error
    })
    const json = await readFile(output, "utf8")

    return JSON.parse(json) as Report
  } finally {
    await unlink(output).catch(() => {})
  }
}
