import { AUDIO_DIR, TEXT_DIR } from "@/directories"
import { UUID } from "@/uuid"
import { join } from "node:path"

export function getEpubDirectory(bookUuid: UUID) {
  return join(TEXT_DIR, bookUuid)
}

export function getEpubSyncedDirectory(bookUuid: UUID) {
  return join(getEpubDirectory(bookUuid), "synced")
}

export function getEpubSyncedFilepath(bookUuid: UUID) {
  return join(getEpubSyncedDirectory(bookUuid), `${bookUuid}.epub`)
}

export function getEpubFilepath(bookUuid: UUID) {
  return join(getEpubDirectory(bookUuid), "original", `${bookUuid}.epub`)
}

export function getEpubIndexPath(bookUuid: UUID) {
  return join(getEpubDirectory(bookUuid), "index.json")
}

export function getAudioDirectory(bookUuid: UUID) {
  return join(AUDIO_DIR, bookUuid)
}

export function getAudioIndexPath(bookUuid: UUID) {
  return join(getAudioDirectory(bookUuid), "index.json")
}

export function getOriginalAudioFilepath(bookUuid: UUID, filename = "") {
  return join(getAudioDirectory(bookUuid), "original", filename)
}

export function getProcessedAudioFilepath(bookUuid: UUID, filename = "") {
  return join(getAudioDirectory(bookUuid), "processed", filename)
}

export function getTranscriptionsFilepath(bookUuid: UUID, filename = "") {
  return join(getAudioDirectory(bookUuid), "transcriptions", filename)
}
