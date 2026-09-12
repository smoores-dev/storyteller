import { open, readdir, stat } from "node:fs/promises"
import { join } from "node:path"

import { LOG_DIR } from "./directories"

const LOG_FILE_PATTERN = /^storyteller-(\d{4}-\d{2}-\d{2})\.log$/

const CHUNK_SIZE = 64 * 1024

export type LogFile = {
  path: string
  date: string
  size: number
  mtimeMs: number
}

export type LogRecord = Record<string, unknown> & {
  level: number
  time: number
}

export type LogMatcher = (record: LogRecord, line: string) => boolean

export function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

export function getLogFilePath(date = todayDateString()) {
  return join(LOG_DIR, `storyteller-${date}.log`)
}

export async function listLogFiles(dir = LOG_DIR): Promise<LogFile[]> {
  let names: string[]

  try {
    names = await readdir(dir)
  } catch {
    return []
  }

  const files: LogFile[] = []

  for (const name of names) {
    const date = name.match(LOG_FILE_PATTERN)?.[1]
    if (!date) continue

    const path = join(dir, name)

    try {
      const { size, mtimeMs } = await stat(path)
      files.push({ path, date, size, mtimeMs })
    } catch {}
  }

  return files.sort((a, b) => b.date.localeCompare(a.date))
}

export function parseLogLine(
  line: string,
  fallbackTime: number,
): LogRecord | null {
  if (!line) return null

  if (line.startsWith("{")) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      if (
        typeof parsed["level"] === "number" &&
        typeof parsed["time"] === "number"
      ) {
        return parsed as LogRecord
      }
    } catch {}
  }

  return { level: 40, time: fallbackTime, msg: line, src: "output" }
}

function splitBufferOnNewlines(buf: Buffer): Buffer[] {
  const segments: Buffer[] = []
  let start = 0

  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      segments.push(buf.subarray(start, i))
      start = i + 1
    }
  }

  if (start < buf.length) {
    segments.push(buf.subarray(start))
  }

  return segments
}

export async function readLastLines(
  file: LogFile,
  lineCount: number,
  matches: LogMatcher = () => true,
): Promise<LogRecord[]> {
  let handle

  try {
    handle = await open(file.path, "r")
  } catch {
    return []
  }

  try {
    const { size: fileSize } = await handle.stat()

    if (fileSize === 0) {
      return []
    }

    let position = fileSize
    let carry: Buffer = Buffer.alloc(0)
    let nearestTime = file.mtimeMs
    const matched: LogRecord[] = []

    const consider = (line: string) => {
      const record = parseLogLine(line, nearestTime)
      if (!record) return
      if (record["src"] !== "output") nearestTime = record.time
      if (matches(record, line)) matched.push(record)
    }

    while (position > 0 && matched.length < lineCount) {
      const readSize = Math.min(CHUNK_SIZE, position)
      position -= readSize

      const buf = Buffer.alloc(readSize)
      const { bytesRead } = await handle.read(buf, 0, readSize, position)
      const actualBuf = bytesRead < readSize ? buf.subarray(0, bytesRead) : buf

      const combined =
        carry.length > 0 ? Buffer.concat([actualBuf, carry]) : actualBuf

      const segments = splitBufferOnNewlines(combined)

      carry =
        position > 0 ? (segments.shift() ?? Buffer.alloc(0)) : Buffer.alloc(0)

      for (let i = segments.length - 1; i >= 0; i--) {
        if (matched.length >= lineCount) break
        consider(segments[i]?.toString("utf-8") ?? "")
      }
    }

    if (carry.length > 0 && matched.length < lineCount) {
      consider(carry.toString("utf-8"))
    }

    matched.reverse()
    return matched
  } finally {
    await handle.close()
  }
}
