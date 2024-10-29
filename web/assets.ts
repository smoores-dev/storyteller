import { mkdir, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { getEpubDirectory, getEpubFilepath } from "./process/processEpub"
import { UUID } from "./uuid"
import {
  AUDIO_FILE_EXTENSIONS,
  getAudioDirectory,
  getOriginalAudioFilepath,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "./process/processAudio"
import { getSyncCachePath } from "./synchronize/syncCache"
import { basename, dirname, extname } from "node:path"

export async function linkEpub(bookUuid: UUID, origin: string) {
  const filepath = getEpubFilepath(bookUuid)
  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await symlink(origin, filepath)
}

export async function persistEpub(bookUuid: UUID, file: File) {
  const filepath = getEpubFilepath(bookUuid)
  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  const arrayBuffer = await file.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)
  await writeFile(filepath, data)
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

export async function persistAudio(bookUuid: UUID, audioFiles: File[]) {
  await Promise.all(
    audioFiles.map(async (file) => {
      const filepath = getOriginalAudioFilepath(bookUuid, file.name)
      const directory = dirname(filepath)
      await mkdir(directory, { recursive: true })

      const arrayBuffer = await file.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)
      return writeFile(filepath, data)
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
  const filenames = await readdir(originalAudioDirectory)

  return filenames.some((filename) => {
    const ext = extname(filename)
    return ext === ".zip" || AUDIO_FILE_EXTENSIONS.includes(ext)
  })
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
    rm(getEpubFilepath(bookUuid)),
    rm(getOriginalAudioFilepath(bookUuid)),
  ])
}

export async function deleteAssets(bookUuid: UUID) {
  await Promise.all([
    rm(getEpubDirectory(bookUuid), { recursive: true, force: true }),
    rm(getAudioDirectory(bookUuid), { recursive: true, force: true }),
    rm(getSyncCachePath(bookUuid), { force: true }),
  ])
}
