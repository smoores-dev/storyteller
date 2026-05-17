import { dirname, extname, relative, resolve } from "node:path"

export type ImportPathChange = {
  path: string
  type: "create" | "update" | "delete"
}

export function normalizePath(path: string): string {
  return resolve(path)
}

export function isWithinPath(rootPath: string, candidatePath: string): boolean {
  const rel = relative(normalizePath(rootPath), normalizePath(candidatePath))
  if (!rel || rel === ".") {
    return true
  }

  return !rel.startsWith("..")
}

export function pathsOverlap(left: string, right: string): boolean {
  return isWithinPath(left, right) || isWithinPath(right, left)
}

export function mergeChangeType(
  previous: ImportPathChange["type"] | undefined,
  next: ImportPathChange["type"],
): ImportPathChange["type"] | null {
  if (!previous) {
    return next
  }

  if (previous === "create") {
    return next === "delete" ? null : "create"
  }

  if (previous === "update") {
    return next === "delete" ? "delete" : "update"
  }

  // previous === "delete"
  return next === "create" ? "update" : "delete"
}

export function coalesceChanges(
  changes: ImportPathChange[],
): ImportPathChange[] {
  const byPath = new Map<string, ImportPathChange["type"]>()

  for (const change of changes) {
    const path = normalizePath(change.path)
    const merged = mergeChangeType(byPath.get(path), change.type)
    if (!merged) {
      byPath.delete(path)
      continue
    }
    byPath.set(path, merged)
  }

  return Array.from(byPath.entries()).map(([path, type]) => ({ path, type }))
}

/**
 * Bucket changes by the directory that should be treated as their "book
 * folder". For files (paths with an extension), this is the parent dir;
 * audiobook directories without an extension are bucketed by themselves.
 * Falls back to the import root for flat layouts.
 */
export function groupChangesByBookFolder(
  importPath: string,
  changes: ImportPathChange[],
): Map<string, ImportPathChange[]> {
  const buckets = new Map<string, ImportPathChange[]>()
  const normalizedImportPath = normalizePath(importPath)

  for (const change of changes) {
    const normalized = normalizePath(change.path)
    if (!isWithinPath(normalizedImportPath, normalized)) continue

    const parent = extname(normalized) ? dirname(normalized) : normalized
    const normalizedParent = normalizePath(parent)
    // never bucket above the import root: a change directly at root level
    // belongs to the root itself (flat layout).
    const bookFolder = isWithinPath(normalizedImportPath, normalizedParent)
      ? normalizedParent
      : normalizedImportPath

    const existing = buckets.get(bookFolder)
    if (existing) {
      existing.push({ ...change, path: normalized })
    } else {
      buckets.set(bookFolder, [{ ...change, path: normalized }])
    }
  }

  return buckets
}
