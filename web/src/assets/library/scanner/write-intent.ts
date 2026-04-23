import { resolve } from "node:path"

// ttl prevents leaked entries if a write fails without cleanup
const DEFAULT_TTL_MS = 60_000

type Entry = {
  timer: NodeJS.Timeout
}

declare global {
  // eslint-disable-next-line no-var
  var writeIntentPending: Map<string, Entry> | undefined
}

const pending = globalThis.writeIntentPending ?? new Map<string, Entry>()
if (!globalThis.writeIntentPending) {
  globalThis.writeIntentPending = pending
}

function toKey(filepath: string): string {
  return resolve(filepath)
}

export function suppressPrefix(filepath: string, ttlMs = DEFAULT_TTL_MS) {
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

export function unsuppressPrefix(filepath: string) {
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
