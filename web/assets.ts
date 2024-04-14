import { mkdir, rm, writeFile } from "node:fs/promises"
import {
  getEpubDirectory,
  getEpubFilepath,
  getEpubSyncedDirectory,
} from "./process/processEpub"
import { UUID } from "./uuid"
import {
  getAudioDirectory,
  getAudioIndexPath,
  getOriginalAudioFilepath,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "./process/processAudio"
import { getSyncCachePath } from "./synchronize/syncCache"
import { dirname } from "node:path"

export async function persistEpub(bookUuid: UUID, file: File) {
  const filepath = getEpubFilepath(bookUuid)
  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  const arrayBuffer = await file.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)
  await writeFile(filepath, data)
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

export async function deleteProcessed(bookUuid: UUID) {
  await Promise.all([
    rm(getEpubSyncedDirectory(bookUuid), { recursive: true, force: true }),
    rm(getProcessedAudioFilepath(bookUuid), { recursive: true, force: true }),
    rm(getTranscriptionsFilepath(bookUuid), { recursive: true, force: true }),
    rm(getAudioIndexPath(bookUuid), { force: true }),
    rm(getSyncCachePath(bookUuid), { force: true }),
  ])
}

export async function deleteAssets(bookUuid: UUID) {
  await Promise.all([
    rm(getEpubDirectory(bookUuid), { recursive: true, force: true }),
    rm(getAudioDirectory(bookUuid), { recursive: true, force: true }),
    rm(getSyncCachePath(bookUuid), { force: true }),
  ])
}
