"use server"

import { nextAuth, hasPermission } from "@/auth/auth"
import { readdir, stat } from "fs/promises"
import { join } from "node:path"

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
  directory: string,
): Promise<DirectoryEntry[]> {
  const session = await nextAuth.auth()
  if (!hasPermission("bookCreate", session?.user)) {
    throw new Error("Forbidden")
  }

  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return []
  }

  const entryStats = (
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const stats = await stat(join(directory, entry))
          return [entry, stats] as const
        } catch {
          return null
        }
      }),
    )
  ).filter((entry) => !!entry)

  return entryStats.map(([filename, stats]) => {
    const path = join(directory, filename)
    return {
      name: filename,
      isDirectory: stats.isDirectory(),
      path: stats.isDirectory() ? `${path}/` : path,
      updatedAt: stats.mtime.toISOString(),
      ...(!stats.isDirectory() && { size: stats.size }),
    } as DirectoryEntry
  })
}
