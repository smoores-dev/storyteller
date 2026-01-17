"use server"

import { readdir, stat } from "fs/promises"
import { join } from "node:path"

import { hasPermission, nextAuth } from "@/auth/auth"
import { DATA_DIR } from "@/directories"

export type DirectoryFileEntry = {
  name: string
  isDirectory: false
  path: string
  updatedAt: string
  size: number
}

export type DirectoryEntry =
  | { name: string; isDirectory: true; path: string; updatedAt: string }
  | DirectoryFileEntry

export async function listDirectoryAction(
  /** null means data dir for server import */
  directory: string | null,
): Promise<{ directory: string; entries: DirectoryEntry[] }> {
  const session = await nextAuth.auth()
  if (!hasPermission("bookCreate", session?.user)) {
    throw new Error("Forbidden")
  }

  const dataDir = directory ?? DATA_DIR.replace(/([^/])$/, "$1/")

  let entries: string[]
  try {
    entries = await readdir(dataDir)
  } catch {
    return { directory: dataDir, entries: [] }
  }

  const entryStats = (
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const stats = await stat(join(dataDir, entry))
          return [entry, stats] as const
        } catch {
          return null
        }
      }),
    )
  ).filter((entry) => !!entry)

  return {
    directory: dataDir,
    entries: entryStats.map(([filename, stats]) => {
      const path = join(dataDir, filename)
      return {
        name: filename,
        isDirectory: stats.isDirectory(),
        path: stats.isDirectory() ? `${path}/` : path,
        updatedAt: stats.mtime.toISOString(),
        ...(!stats.isDirectory() && { size: stats.size }),
      } as DirectoryEntry
    }),
  }
}
