import { copyFile, mkdir, readdir, rm, stat, symlink } from "node:fs/promises"
import { UUID } from "../uuid"
import { getSyncCachePath } from "../synchronize/syncCache"
import { basename, dirname, extname } from "node:path"
import { isAudioFile } from "../audio"
import {
  getEpubFilepath,
  getEpubDirectory,
  getAudioDirectory,
  getOriginalAudioFilepath,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "./paths"

export async function linkEpub(bookUuid: UUID, origin: string) {
  const filepath = getEpubFilepath(bookUuid)
  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await symlink(origin, filepath)
}

export async function persistEpub(bookUuid: UUID, tmpPath: string) {
  const filepath = getEpubFilepath(bookUuid)
  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await copyFile(tmpPath, filepath)
  await rm(tmpPath)
}

export async function linkAudio(bookUuid: UUID, origins: string[]) {
  await Promise.all(
    origins.map(async (origin) => {
      const base = basename(origin)
      const filepath = getOriginalAudioFilepath(bookUuid, base)
      const directory = dirname(filepath)
      await mkdir(directory, { recursive: true })

      await symlink(origin, filepath)
    }),
  )
}

export async function persistAudio(bookUuid: UUID, audioPaths: string[]) {
  await Promise.all(
    audioPaths.map(async (path) => {
      const filename = basename(path)
      const filepath = getOriginalAudioFilepath(bookUuid, filename)
      const directory = dirname(filepath)
      await mkdir(directory, { recursive: true })
      await copyFile(path, filepath)
      await rm(path)
    }),
  )
}

export async function originalEpubExists(bookUuid: UUID) {
  try {
    await stat(getEpubFilepath(bookUuid))
    return true
  } catch {
    return false
  }
}

export async function originalAudioExists(bookUuid: UUID) {
  const originalAudioDirectory = getOriginalAudioFilepath(bookUuid)
  try {
    const filenames = await readdir(originalAudioDirectory)

    return filenames.some((filename) => {
      const ext = extname(filename)
      return ext === ".zip" || isAudioFile(ext)
    })
  } catch {
    return false
  }
}

export async function deleteProcessed(bookUuid: UUID) {
  await Promise.all([
    rm(getProcessedAudioFilepath(bookUuid), { recursive: true, force: true }),
    rm(getTranscriptionsFilepath(bookUuid), { recursive: true, force: true }),
    rm(getSyncCachePath(bookUuid), { force: true }),
  ])
}

export async function deleteOriginals(bookUuid: UUID) {
  await Promise.all([
    rm(getEpubFilepath(bookUuid), { force: true }),
    rm(getOriginalAudioFilepath(bookUuid), { recursive: true, force: true }),
  ])
}

export async function deleteAssets(bookUuid: UUID) {
  await Promise.all([
    rm(getEpubDirectory(bookUuid), { recursive: true, force: true }),
    rm(getAudioDirectory(bookUuid), { recursive: true, force: true }),
    rm(getSyncCachePath(bookUuid), { force: true }),
  ])
}
