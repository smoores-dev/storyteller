import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  getAudioIndexPath,
  getAudioDirectory,
  getEpubDirectory,
  getEpubIndexPath,
} from "./paths"
import { UUID } from "@/uuid"

export type AudioFile = {
  filename: string
  bare_filename: string
  extension: string
}

export type AudioIndex = {
  cover?: string
  processed_files?: AudioFile[]
}

export async function getAudioIndex(
  bookUuid: UUID,
): Promise<null | AudioIndex> {
  const path = getAudioIndexPath(bookUuid)

  try {
    const indexFile = await readFile(path, {
      encoding: "utf-8",
    })
    return JSON.parse(indexFile) as AudioIndex
  } catch {
    return null
  }
}

export async function getAudioCoverFilepath(bookUuid: UUID) {
  const index = await getAudioIndex(bookUuid)
  if (index === null) return index

  if (!("cover" in index)) return null

  return join(getAudioDirectory(bookUuid), index.cover)
}

export async function getProcessedAudioFiles(bookUuid: UUID) {
  const index = await getAudioIndex(bookUuid)
  return index?.processed_files?.sort(({ filename: a }, { filename: b }) => {
    if (a < b) return -1
    if (b > a) return 1
    return 0
  })
}

export async function persistAudioCover(bookUuid: UUID, coverFilename: string) {
  const index = (await getAudioIndex(bookUuid)) ?? {}
  index.cover = coverFilename

  await writeFile(getAudioIndexPath(bookUuid), JSON.stringify(index), {
    encoding: "utf-8",
  })
}

export async function persistCustomAudioCover(
  bookUuid: UUID,
  filename: string,
  cover: Uint8Array,
) {
  const coverFilepath = join(getAudioDirectory(bookUuid), filename)
  await writeFile(coverFilepath, cover)
  await persistAudioCover(bookUuid, filename)
}

export async function getEpubIndex(
  bookUuid: UUID,
): Promise<null | { cover?: string }> {
  const path = getEpubIndexPath(bookUuid)

  try {
    const indexFile = await readFile(path, {
      encoding: "utf-8",
    })
    return JSON.parse(indexFile) as { cover?: string }
  } catch (_) {
    return null
  }
}

export async function getEpubCoverFilepath(bookUuid: UUID) {
  const index = await getEpubIndex(bookUuid)
  if (index === null) return index

  if (!("cover" in index)) return null

  return join(getEpubDirectory(bookUuid), index.cover)
}

export async function persistEpubCover(bookUuid: UUID, coverFilename: string) {
  const index = (await getEpubIndex(bookUuid)) ?? {}
  index.cover = coverFilename

  await writeFile(getEpubIndexPath(bookUuid), JSON.stringify(index), {
    encoding: "utf-8",
  })
}

export async function persistCustomEpubCover(
  bookUuid: UUID,
  filename: string,
  cover: Uint8Array,
) {
  const coverFilepath = join(getEpubDirectory(bookUuid), filename)
  await writeFile(coverFilepath, cover)
  await persistEpubCover(bookUuid, filename)
}
