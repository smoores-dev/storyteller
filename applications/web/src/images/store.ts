import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pid } from "node:process"

import { IMAGES_DIR } from "@/directories"

export function hashImage(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex")
}

export function getImageBlobPath(sha256: string): string {
  return join(IMAGES_DIR, sha256.slice(0, 2), sha256.slice(2, 4), sha256)
}

export async function imageBlobExists(sha256: string): Promise<boolean> {
  try {
    await stat(getImageBlobPath(sha256))
    return true
  } catch {
    return false
  }
}

export async function writeImageBlob(
  sha256: string,
  data: Buffer | Uint8Array,
): Promise<string> {
  const path = getImageBlobPath(sha256)
  if (await imageBlobExists(sha256)) return path

  await mkdir(dirname(path), { recursive: true })

  const tmpPath = `${path}.${pid}.tmp`
  try {
    await writeFile(tmpPath, data)
    await rename(tmpPath, path)
  } catch (err) {
    await rm(tmpPath, { force: true })
    throw err
  }

  return path
}

export async function readImageBlob(sha256: string): Promise<Buffer | null> {
  try {
    return await readFile(getImageBlobPath(sha256))
  } catch {
    return null
  }
}

export async function deleteImageBlob(sha256: string): Promise<void> {
  await rm(getImageBlobPath(sha256), { force: true })
}
