import { type ImportPathEntry } from "./settingsTypes"

export function validateNoDuplicatePaths(paths: ImportPathEntry[] | null) {
  if (!paths) return

  const seen = new Set<string>()

  for (const entry of paths) {
    if (seen.has(entry.path)) {
      throw new Error(`duplicate import path: "${entry.path}"`)
    }
    seen.add(entry.path)
  }
}
