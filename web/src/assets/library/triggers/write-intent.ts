import { resolve } from "node:path"

// ttl prevents leaked entries if a write fails without cleanup
const DEFAULT_TTL_MS = 60_000

type Entry = {
  timer: NodeJS.Timeout
}

const pending = new Map<string, Entry>()

function toKey(filepath: string): string {
  return resolve(filepath)
}

export function suppressPath(filepath: string, ttlMs = DEFAULT_TTL_MS) {
  const key = toKey(filepath)
  const existing = pending.get(key)
  if (existing) {
    clearTimeout(existing.timer)
  }

  const timer = setTimeout(() => {
    pending.delete(key)
  }, ttlMs)

  timer.unref()
  pending.set(key, { timer })
}

export function unsuppressPath(filepath: string) {
  const key = toKey(filepath)
  const existing = pending.get(key)
  if (!existing) {
    return
  }

  clearTimeout(existing.timer)
  pending.delete(key)
}

export function isSuppressed(filepath: string): boolean {
  const key = toKey(filepath)

  if (pending.has(key)) {
    return true
  }

  for (const suppressed of pending.keys()) {
    if (key.startsWith(suppressed + "/")) {
      return true
    }
    if (key.startsWith(suppressed + "\\")) {
      return true
    }
  }

  return false
}

export function suppressDirectory(dirpath: string, ttlMs = DEFAULT_TTL_MS) {
  suppressPath(dirpath, ttlMs)
}

export function unsuppressDirectory(dirpath: string) {
  unsuppressPath(dirpath)
}
