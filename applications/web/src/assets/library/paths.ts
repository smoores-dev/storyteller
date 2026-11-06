import { resolve, sep } from "node:path"

export function pathBelongsTo(folder: string, candidatePath: string): boolean {
  const f = resolve(folder)
  const p = resolve(candidatePath)
  return p === f || p.startsWith(f + sep)
}

export function filepathFolder(filepath: string): string {
  return filepath.replace(/\/[^/]+$/, "")
}
