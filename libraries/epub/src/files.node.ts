import { openAsBlob } from "node:fs"
import { cp, mkdir } from "node:fs/promises"

import { dirname } from "@storyteller-platform/path"

export async function openFile(path: string): Promise<Blob> {
  return await openAsBlob(path)
}

export async function copyFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to, { force: true })
}
