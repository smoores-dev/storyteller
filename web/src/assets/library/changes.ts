import { dirname, extname, relative, resolve } from "node:path"

export type ImportPathChange = {
  path: string
  type: "create" | "update" | "delete"
}

function normalizePath(path: string): string {
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

export function getDiscoveryRootsFromChanges(
  importPath: string,
  changes: ImportPathChange[],
): string[] {
  const roots = new Set<string>()
  const normalizedImportPath = normalizePath(importPath)

  for (const change of changes) {
    if (change.type === "delete") {
      continue
    }

    const candidateRoot = extname(change.path)
      ? dirname(change.path)
      : change.path
    const normalizedCandidateRoot = normalizePath(candidateRoot)

    if (!isWithinPath(normalizedImportPath, normalizedCandidateRoot)) {
      continue
    }
    if (normalizedCandidateRoot === normalizedImportPath) {
      continue
    }

    roots.add(normalizedCandidateRoot)
  }

  return Array.from(roots)
}
