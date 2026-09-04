import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import {
  type LogMatcher,
  listLogFiles,
  readLastLines,
  todayDateString,
} from "@/logFiles"

export const dynamic = "force-dynamic"

const MAX_LINES = 5000
const DEFAULT_LINES = 500

const LEVEL_VALUES: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

function createMatcher(minLevel: number, search: string): LogMatcher {
  return (record, line) => {
    if (minLevel > 0 && record.level < minLevel) return false
    if (search && !line.toLowerCase().includes(search)) return false
    return true
  }
}

export const GET = withHasPermission("settingsUpdate")(async (request) => {
  const url = new URL(request.url)

  const linesParam = url.searchParams.get("lines")
  const lineCount = Math.min(
    Math.max(1, parseInt(linesParam ?? "", 10) || DEFAULT_LINES),
    MAX_LINES,
  )

  const search = (url.searchParams.get("search") ?? "").toLowerCase()
  const levelParam = url.searchParams.get("level") ?? ""
  const minLevel = LEVEL_VALUES[levelParam] ?? 0
  const today = todayDateString()
  const date = url.searchParams.get("date") ?? today

  const files = await listLogFiles()
  const file = files.find((f) => f.date === date)

  const lines = file
    ? await readLastLines(file, lineCount, createMatcher(minLevel, search))
    : []

  const availableDates = [...new Set(files.map((f) => f.date))]
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)

  return NextResponse.json({ lines, date, today, availableDates, totalBytes })
})
