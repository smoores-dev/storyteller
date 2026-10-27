const STORAGE_KEY = "studio:requests"
const BUCKET_MS = 60_000
const WINDOW_MS = 60 * 60_000

export interface RateLimitSnapshot {
  used: number
  limit: number
  blockedUntil: number | null
  remainingHeader: number | null
}

export class RateLimitMonitor {
  private buckets = new Map<number, number>()
  private blocked: number | null = null
  private remaining: number | null = null
  private listeners = new Set<() => void>()
  private snapshot: RateLimitSnapshot
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly limit = 5000,
    private readonly now: () => number = Date.now,
    private readonly persist = true,
  ) {
    this.load()
    this.snapshot = this.compute()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  private compute(): RateLimitSnapshot {
    const cutoff = this.now() - WINDOW_MS
    let used = 0
    for (const [bucket, count] of this.buckets) {
      if (bucket + BUCKET_MS > cutoff) {
        used += count
      }
    }

    const blockedUntil =
      this.blocked !== null && this.blocked > this.now() ? this.blocked : null
    return {
      used,
      limit: this.limit,
      blockedUntil,
      remainingHeader: this.remaining,
    }
  }

  private publish() {
    this.snapshot = this.compute()
    for (const listener of this.listeners) {
      listener()
    }
  }

  record() {
    const bucket = Math.floor(this.now() / BUCKET_MS) * BUCKET_MS
    this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + 1)
    this.prune()
    this.publish()
    this.scheduleSave()
  }

  observe(headers: Headers) {
    const remaining = Number(headers.get("ratelimit-remaining"))
    if (
      headers.get("ratelimit-remaining") !== null &&
      !Number.isNaN(remaining)
    ) {
      this.remaining = remaining
      this.publish()
    }
  }

  blockedUntil(): number | null {
    return this.snapshot.blockedUntil !== null &&
      this.snapshot.blockedUntil > this.now()
      ? this.snapshot.blockedUntil
      : null
  }

  block(until: number) {
    this.blocked = until
    this.publish()
    const wait = Math.max(until - this.now(), 0) + 250
    setTimeout(() => this.publish(), wait)
  }

  private prune() {
    const cutoff = this.now() - WINDOW_MS
    for (const bucket of [...this.buckets.keys()]) {
      if (bucket + BUCKET_MS <= cutoff) {
        this.buckets.delete(bucket)
      }
    }
  }

  private load() {
    if (!this.persist) {
      return
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw) as Record<string, number>
      for (const [bucket, count] of Object.entries(parsed)) {
        if (typeof count === "number") {
          this.buckets.set(Number(bucket), count)
        }
      }

      this.prune()
    } catch {
      return
    }
  }

  private scheduleSave() {
    if (!this.persist || this.saveTimer !== null) {
      return
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(Object.fromEntries(this.buckets)),
        )
      } catch {
        return
      }
    }, 2000)
  }
}

export function parseRetryAfter(headers: Headers, now: number): number | null {
  const retry = headers.get("retry-after")
  if (retry !== null) {
    const seconds = Number(retry)
    if (!Number.isNaN(seconds)) {
      return now + seconds * 1000
    }

    const date = Date.parse(retry)
    if (!Number.isNaN(date)) {
      return date
    }
  }

  const reset = headers.get("ratelimit-reset")
  if (reset !== null) {
    const epoch = Number(reset)
    if (!Number.isNaN(epoch)) {
      return epoch * 1000
    }
  }

  return null
}

export class Semaphore {
  private active = 0
  private waiting: (() => void)[] = []

  constructor(private readonly size: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.size) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    } else {
      this.active += 1
    }

    let released = false
    return () => {
      if (released) {
        return
      }

      released = true
      const next = this.waiting.shift()
      if (next) {
        next()
      } else {
        this.active -= 1
      }
    }
  }
}

let shared: RateLimitMonitor | null = null

export function sharedRateLimitMonitor(limit: number): RateLimitMonitor {
  if (!shared) {
    shared = new RateLimitMonitor(limit)
  }

  return shared
}
