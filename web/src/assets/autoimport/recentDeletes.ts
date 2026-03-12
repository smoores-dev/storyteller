import { resolve } from "node:path"

const DEFAULT_TTL_MS = 5 * 60_000

type Entry = {
  timer: NodeJS.Timeout
}

const recentDeletes = new Map<string, Entry>()

function normalize(path: string): string {
  return resolve(path)
}

function pathsOverlap(left: string, right: string): boolean {
  if (left === right) {
    return true
  }
  if (left.startsWith(`${right}/`) || left.startsWith(`${right}\\`)) {
    return true
  }
  if (right.startsWith(`${left}/`) || right.startsWith(`${left}\\`)) {
    return true
  }
  return false
}

export function rememberDeletedPath(path: string, ttlMs = DEFAULT_TTL_MS) {
  const key = normalize(path)
  const existing = recentDeletes.get(key)
  if (existing) {
    clearTimeout(existing.timer)
  }

  const timer = setTimeout(() => {
    recentDeletes.delete(key)
  }, ttlMs)
  timer.unref()

  recentDeletes.set(key, { timer })
}

export function wasPathRecentlyDeleted(path: string): boolean {
  const key = normalize(path)
  for (const deletedPath of recentDeletes.keys()) {
    if (pathsOverlap(key, deletedPath)) {
      return true
    }
  }
  return false
}
