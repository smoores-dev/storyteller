import { Directory, File } from "expo-file-system"
import * as FileSystem from "expo-file-system/legacy"

import { extractArchive } from "@/modules/readium"
import { type UUID } from "@/uuid"

export function getBooksDirectoryUrl() {
  return `${FileSystem.documentDirectory}books/`
}

export async function ensureBooksDirectory() {
  const coversDirInfo = await FileSystem.getInfoAsync(getBooksDirectoryUrl())
  if (!coversDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getBooksDirectoryUrl(), {})
  }
}

export async function importBookFile(uuid: UUID, externalPath: string) {
  const externalFile = new File(externalPath)
  const externalBytes = await externalFile.bytes()
  const archiveFile = new File(getLocalBookArchiveUrl(uuid, "readaloud"))

  archiveFile.create({ intermediates: true })
  archiveFile.write(externalBytes)

  await extractArchive(
    archiveFile.uri,
    getLocalBookExtractedUrl(uuid, "readaloud"),
  )
}

export async function copyReadaloudToEbook(uuid: UUID) {
  const ebookArchiveFile = new File(getLocalBookArchiveUrl(uuid, "ebook"))
  ebookArchiveFile.parentDirectory.create({ intermediates: true })
  new File(getLocalBookArchiveUrl(uuid, "readaloud")).copy(ebookArchiveFile)

  const ebookExtractedDirectory = new Directory(
    getLocalBookExtractedUrl(uuid, "ebook"),
  )
  new Directory(getLocalBookExtractedUrl(uuid, "readaloud")).copy(
    ebookExtractedDirectory,
  )
}

export function getBookArchivesDirectoryUrl() {
  return `${getBooksDirectoryUrl()}archives/`
}

export function getBookCoversDirectoryUrl() {
  return `${getBooksDirectoryUrl()}covers/`
}

export function getAudioBookCoversDirectoryUrl() {
  return `${getBooksDirectoryUrl()}audiocovers/`
}

export function getBookExtractedDirectoryUrl() {
  return `${getBooksDirectoryUrl()}extracted/`
}

export function getOldLocalBookCoverUrl(bookUuid: UUID) {
  return `${getBookCoversDirectoryUrl()}${bookUuid}`
}

export function getLocalBookCoverUrl(bookUuid: UUID, ext = ".jpg") {
  return `${getBookCoversDirectoryUrl()}${bookUuid}${ext}`
}

export function getOldLocalAudioBookCoverUrl(bookUuid: UUID) {
  return `${getAudioBookCoversDirectoryUrl()}${bookUuid}`
}

export function getLocalAudioBookCoverUrl(bookUuid: UUID, ext = ".jpg") {
  return `${getAudioBookCoversDirectoryUrl()}${bookUuid}${ext}`
}

export function getLocalBookArchiveUrl(
  bookUuid: UUID,
  format: "readaloud" | "ebook" | "audiobook",
) {
  return `${getBookArchivesDirectoryUrl()}/${bookUuid}/${format}/${bookUuid}${format === "audiobook" ? `.audiobook` : `.epub`}`
}

export function getLocalBookExtractedUrl(
  bookUuid: UUID,
  format: "readaloud" | "ebook" | "audiobook",
) {
  return `${getBookExtractedDirectoryUrl()}${bookUuid}/${format}/`
}

export function getLocalBookFileUrl(
  bookUuid: UUID,
  format: "readaloud" | "ebook" | "audiobook",
  relativeFilepath: string,
) {
  return `${getLocalBookExtractedUrl(bookUuid, format)}${
    format === "audiobook"
      ? relativeFilepath
      : relativeFilepath
          .split("/")

          .map((s) =>
            encodeURIComponent(s)
              // The sync system percent-encodes single quotes as %27,
              // but Readium decodes them back to single quotes,
              // so we need to replace single quotes with percent-encoded
              // %27 (as %2527) in order to match the actual file names
              // on disk
              .replaceAll("'", "%2527"),
          )
          .join("/")
  }`
}

export async function readBookFile(
  bookUuid: UUID,
  format: "readaloud" | "ebook",
  relativeFilepath: string,
) {
  return await FileSystem.readAsStringAsync(
    getLocalBookFileUrl(bookUuid, format, relativeFilepath),
  )
}

export async function deleteLocalBookFiles(bookUuid: UUID) {
  return await Promise.all([
    FileSystem.deleteAsync(getLocalBookExtractedUrl(bookUuid, "readaloud"), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getLocalBookExtractedUrl(bookUuid, "ebook"), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getLocalBookExtractedUrl(bookUuid, "audiobook"), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, "readaloud"), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, "audiobook"), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, "ebook"), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getOldLocalBookCoverUrl(bookUuid), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getOldLocalAudioBookCoverUrl(bookUuid), {
      idempotent: true,
    }),
  ])
}

export async function ensureCoversDirectory() {
  await ensureBooksDirectory()
  const coversDirInfo = await FileSystem.getInfoAsync(
    getBookCoversDirectoryUrl(),
  )
  if (!coversDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getBookCoversDirectoryUrl(), {})
  }
  const audioCoversDirInfo = await FileSystem.getInfoAsync(
    getAudioBookCoversDirectoryUrl(),
  )
  if (!audioCoversDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getAudioBookCoversDirectoryUrl(), {})
  }
}
