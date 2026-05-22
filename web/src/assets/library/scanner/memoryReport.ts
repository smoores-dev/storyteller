import { logger } from "@/logging"

// gated behind STORYTELLER_SCAN_MEM_PROFILE=1 so production runs pay nothing.
// when on, logs RSS / heap deltas per candidate so we can attribute growth
// to specific files or formats.

const ENABLED = process.env["STORYTELLER_SCAN_MEM_PROFILE"] === "1"

const MB = 1024 * 1024

function fmtMB(bytes: number): string {
  const sign = bytes >= 0 ? "+" : ""
  return `${sign}${(bytes / MB).toFixed(1)}MB`
}

export type MemorySnapshot = {
  rss: number
  heapUsed: number
  external: number
}

export function snapshot(): MemorySnapshot | null {
  if (!ENABLED) return null
  const m = process.memoryUsage()
  return { rss: m.rss, heapUsed: m.heapUsed, external: m.external }
}

export function reportDelta(
  label: string,
  before: MemorySnapshot | null,
): void {
  if (!ENABLED || !before) return
  const m = process.memoryUsage()
  logger.info({
    msg: `[scan-mem] ${label}`,
    rssDelta: fmtMB(m.rss - before.rss),
    heapDelta: fmtMB(m.heapUsed - before.heapUsed),
    externalDelta: fmtMB(m.external - before.external),
    rssNow: fmtMB(m.rss),
    heapNow: fmtMB(m.heapUsed),
  })
}
