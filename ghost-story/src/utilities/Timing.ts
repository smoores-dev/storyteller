export interface TimingSpan {
  name: string
  startTime: number
  endTime: number
  duration: number
}

export interface PhaseTiming {
  name: string
  duration: number
  percentage: number
}

export interface TimingSummary {
  totalMs: number
  wallClockMs: number
  phases: PhaseTiming[]
  spans: TimingSpan[]
  metadata: Record<string, string | number | boolean>
}

export class Timing {
  private spans: TimingSpan[] = []
  private activeSpans: Map<string, number> = new Map()
  private startTime: number = 0
  private metadata: Record<string, string | number | boolean> = {}

  constructor() {
    this.startTime = performance.now()
  }

  time<T>(name: string, fn: () => T): T {
    const start = performance.now()
    try {
      return fn()
    } finally {
      const end = performance.now()
      this.spans.push({
        name,
        startTime: start - this.startTime,
        endTime: end - this.startTime,
        duration: end - start,
      })
    }
  }

  async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    try {
      return await fn()
    } finally {
      const end = performance.now()
      this.spans.push({
        name,
        startTime: start - this.startTime,
        endTime: end - this.startTime,
        duration: end - start,
      })
    }
  }

  start(name: string): () => void {
    const start = performance.now()
    this.activeSpans.set(name, start)
    return () => {
      this.end(name)
    }
  }

  end(name: string): void {
    const start = this.activeSpans.get(name)
    if (start === undefined) return
    const end = performance.now()
    this.activeSpans.delete(name)
    this.spans.push({
      name,
      startTime: start - this.startTime,
      endTime: end - this.startTime,
      duration: end - start,
    })
  }

  setMetadata(key: string, value: string | number | boolean): this {
    this.metadata[key] = value
    return this
  }

  addMetadata(data: Record<string, string | number | boolean>): this {
    Object.assign(this.metadata, data)
    return this
  }

  getElapsedMs(): number {
    return performance.now() - this.startTime
  }

  summary(): TimingSummary {
    const wallClockMs = performance.now() - this.startTime
    const totalMs = this.spans.reduce((sum, s) => sum + s.duration, 0)

    const phaseMap = new Map<string, number>()
    for (const span of this.spans) {
      phaseMap.set(span.name, (phaseMap.get(span.name) ?? 0) + span.duration)
    }

    const phases: PhaseTiming[] = [...phaseMap.entries()].map(
      ([name, duration]) => ({
        name,
        duration,
        percentage: totalMs > 0 ? (duration / totalMs) * 100 : 0,
      }),
    )

    return {
      totalMs,
      wallClockMs,
      phases,
      spans: [...this.spans],
      metadata: { ...this.metadata },
    }
  }
}

export function createTiming(): Timing {
  return new Timing()
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(1)
  return `${minutes}m ${seconds}s`
}

export function formatPercentage(pct: number): string {
  return `${pct.toFixed(1)}%`
}

export interface AggregatedStats {
  count: number
  totalMs: number
  wallClockMs: number
  avgMs: number
  minMs: number
  maxMs: number
  phaseStats: Map<
    string,
    { totalMs: number; avgMs: number; percentage: number }
  >
}

export class TimingAggregator {
  private summaries: TimingSummary[] = []
  private metadata: Record<string, string | number | boolean> = {}
  private aggregatorStartTime: number = performance.now()

  add(summary: TimingSummary): this {
    this.summaries.push(summary)
    return this
  }

  setMetadata(key: string, value: string | number | boolean): this {
    this.metadata[key] = value
    return this
  }

  getStats(): AggregatedStats {
    if (this.summaries.length === 0) {
      return {
        count: 0,
        totalMs: 0,
        wallClockMs: 0,
        avgMs: 0,
        minMs: 0,
        maxMs: 0,
        phaseStats: new Map(),
      }
    }

    const wallClockTotals = this.summaries.map((s) => s.wallClockMs)
    const totalMs = wallClockTotals.reduce((a, b) => a + b, 0)
    const wallClockMs = performance.now() - this.aggregatorStartTime
    const avgMs = totalMs / this.summaries.length
    const minMs = Math.min(...wallClockTotals)
    const maxMs = Math.max(...wallClockTotals)

    const phaseStats = new Map<
      string,
      { totalMs: number; avgMs: number; percentage: number }
    >()

    for (const summary of this.summaries) {
      for (const phase of summary.phases) {
        const existing = phaseStats.get(phase.name)
        if (existing) {
          existing.totalMs += phase.duration
        } else {
          phaseStats.set(phase.name, {
            totalMs: phase.duration,
            avgMs: 0,
            percentage: 0,
          })
        }
      }
    }

    const phaseTotalMs = [...phaseStats.values()].reduce(
      (sum, p) => sum + p.totalMs,
      0,
    )
    for (const [, stats] of phaseStats) {
      stats.avgMs = stats.totalMs / this.summaries.length
      stats.percentage =
        phaseTotalMs > 0 ? (stats.totalMs / phaseTotalMs) * 100 : 0
    }

    return {
      count: this.summaries.length,
      totalMs,
      wallClockMs,
      avgMs,
      minMs,
      maxMs,
      phaseStats,
    }
  }

  formatReport(title?: string): string {
    const stats = this.getStats()
    const lines: string[] = []

    const divider = "-".repeat(60)
    lines.push(divider)
    lines.push(title ?? "Timing Report")
    lines.push(divider)

    for (const [key, value] of Object.entries(this.metadata)) {
      lines.push(`  ${key}: ${value}`)
    }

    if (Object.keys(this.metadata).length > 0) {
      lines.push("")
    }

    lines.push(`  Files processed: ${stats.count}`)
    lines.push(`  Wall clock time: ${formatDuration(stats.wallClockMs)}`)
    lines.push(`  Combined time: ${formatDuration(stats.totalMs)}`)
    lines.push(`  Average per file: ${formatDuration(stats.avgMs)}`)
    lines.push(`  Fastest: ${formatDuration(stats.minMs)}`)
    lines.push(`  Slowest: ${formatDuration(stats.maxMs)}`)

    if (stats.phaseStats.size > 0) {
      lines.push("")
      lines.push("  Time by phase:")

      const sortedPhases = [...stats.phaseStats.entries()].sort(
        (a, b) => b[1].totalMs - a[1].totalMs,
      )

      for (const [name, phaseData] of sortedPhases) {
        const pct = formatPercentage(phaseData.percentage)
        const avg = formatDuration(phaseData.avgMs)
        const total = formatDuration(phaseData.totalMs)
        lines.push(
          `    ${name.padEnd(20)} ${pct.padStart(6)}  avg: ${avg.padStart(8)}  total: ${total}`,
        )
      }
    }

    lines.push(divider)

    return lines.join("\n")
  }

  print(title?: string): void {
    // eslint-disable-next-line no-console
    console.log(this.formatReport(title))
  }
}

export function createAggregator(): TimingAggregator {
  return new TimingAggregator()
}

export function formatSingleReport(
  summary: TimingSummary,
  title?: string,
): string {
  const lines: string[] = []

  const divider = "-".repeat(50)
  lines.push(divider)
  lines.push(title ?? "Timing")
  lines.push(divider)

  for (const [key, value] of Object.entries(summary.metadata)) {
    lines.push(`  ${key}: ${value}`)
  }

  if (Object.keys(summary.metadata).length > 0) {
    lines.push("")
  }

  lines.push(`  Wall clock: ${formatDuration(summary.wallClockMs)}`)
  lines.push(`  Active time: ${formatDuration(summary.totalMs)}`)

  if (summary.phases.length > 0) {
    lines.push("")

    const sortedPhases = [...summary.phases].sort(
      (a, b) => b.duration - a.duration,
    )

    for (const phase of sortedPhases) {
      const pct = formatPercentage(phase.percentage)
      const dur = formatDuration(phase.duration)
      lines.push(
        `    ${phase.name.padEnd(20)} ${pct.padStart(6)}  ${dur.padStart(10)}`,
      )
    }
  }

  lines.push(divider)

  return lines.join("\n")
}

export function printSingleReport(
  summary: TimingSummary,
  title?: string,
): void {
  // eslint-disable-next-line no-console
  console.log(formatSingleReport(summary, title))
}
