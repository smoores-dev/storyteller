"use server"

import { pathBelongsTo } from "@/assets/library/scanner/folder"
import { getCurrentUser } from "@/auth/auth"
import { ASSETS_DIR } from "@/directories"

/**
 * Returns the subset of paths that live outside ASSETS_DIR (reference
 * imports), i.e. the ones `deleteAssets` leaves on disk.
 */
export async function getReferencePathsAction(
  paths: string[],
): Promise<string[]> {
  const user = await getCurrentUser()
  if (!user?.permissions.bookDelete) {
    throw new Error("Forbidden")
  }
  return paths.filter((p) => !pathBelongsTo(ASSETS_DIR, p))
}
