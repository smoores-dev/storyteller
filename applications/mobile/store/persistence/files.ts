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

export type BookFileImportStage = "copying" | "extracting"

export async function importBookFile(
  uuid: UUID,
  externalPath: string,
  onStage?: (stage: BookFileImportStage) => void,
) {
  const archiveFile = new File(getLocalBookArchiveUrl(uuid, "readaloud"))
  // make sure the destination directory exists without materialising the file
  archiveFile.parentDirectory.create({ intermediates: true, idempotent: true })

  onStage?.("copying")
  await FileSystem.copyAsync({ from: externalPath, to: archiveFile.uri })

  onStage?.("extracting")
  await extractArchive(
    archiveFile.uri,
    getLocalBookExtractedUrl(uuid, "readaloud"),
  )
}

export async function copyReadaloudToEbook(uuid: UUID) {
  const ebookArchiveFile = new File(getLocalBookArchiveUrl(uuid, "ebook"))
  ebookArchiveFile.parentDirectory.create({ intermediates: true })
  await new File(getLocalBookArchiveUrl(uuid, "readaloud")).copy(
    ebookArchiveFile,
  )

  const ebookExtractedDirectory = new Directory(
    getLocalBookExtractedUrl(uuid, "ebook"),
  )
  await new Directory(getLocalBookExtractedUrl(uuid, "readaloud")).copy(
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

/**
 * The path of a manifest/media-overlay href on disk, i.e. what the archive extractor wrote.
 *
 * Hrefs arrive percent-encoded from the native layer (Readium's `Link.href`), while zip entries
 * are extracted under their literal names, so the href has to be decoded before it can be used as
 * a path. A malformed escape is treated as a literal path rather than throwing.
 */
function hrefToPath(href: string) {
  const url = new URL(href, "publication:///")
  return decodeURIComponent(url.pathname.slice(1))
}

/**
 * The `file` URL of a resource inside an extracted book.
 */
export function getLocalBookFileUrl(
  bookUuid: UUID,
  format: "readaloud" | "ebook" | "audiobook",
  href: string,
) {
  return `${getLocalBookExtractedUrl(bookUuid, format)}${hrefToPath(href)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`
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

export async function deleteLocalBookFiles(
  bookUuid: UUID,
  format?: "ebook" | "readaloud" | "audiobook",
) {
  const deletions: Promise<void>[] = []

  if (!format || format === "readaloud") {
    deletions.push(
      FileSystem.deleteAsync(getLocalBookExtractedUrl(bookUuid, "readaloud"), {
        idempotent: true,
      }),
      FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, "readaloud"), {
        idempotent: true,
      }),
    )
  }
  if (!format || format === "ebook") {
    deletions.push(
      FileSystem.deleteAsync(getLocalBookExtractedUrl(bookUuid, "ebook"), {
        idempotent: true,
      }),
      FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, "ebook"), {
        idempotent: true,
      }),
    )
  }
  if (!format || format === "audiobook") {
    deletions.push(
      FileSystem.deleteAsync(getLocalBookExtractedUrl(bookUuid, "audiobook"), {
        idempotent: true,
      }),
      FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, "audiobook"), {
        idempotent: true,
      }),
    )
  }
  if (!format) {
    deletions.push(
      FileSystem.deleteAsync(getOldLocalBookCoverUrl(bookUuid), {
        idempotent: true,
      }),
      FileSystem.deleteAsync(getOldLocalAudioBookCoverUrl(bookUuid), {
        idempotent: true,
      }),
    )
  }

  await Promise.all(deletions)
  await deleteEmptyBookDirectories(bookUuid)
}

/**
 * Deletes a directory only when it holds nothing, so that pruning a book's own
 * directories can never take a sibling format's files with it. Failures are
 * ignored: a leftover directory is cosmetic and must not fail the operation
 * that triggered the cleanup.
 */
async function deleteDirectoryIfEmpty(directory: Directory) {
  try {
    if (!directory.exists || directory.list().length > 0) return
    directory.delete()
  } catch {
    // pass
  }
}

/**
 * Prune the directories a book's files lived in, leaving any that still hold
 * data alone.
 */
async function deleteEmptyBookDirectories(bookUuid: UUID) {
  const archiveRoot = new File(getLocalBookArchiveUrl(bookUuid, "readaloud"))
    .parentDirectory.parentDirectory

  for (const format of ["readaloud", "ebook", "audiobook"] as const) {
    await deleteDirectoryIfEmpty(
      new File(getLocalBookArchiveUrl(bookUuid, format)).parentDirectory,
    )
  }

  await deleteDirectoryIfEmpty(archiveRoot)
  await deleteDirectoryIfEmpty(
    new Directory(getLocalBookExtractedUrl(bookUuid, "readaloud"))
      .parentDirectory,
  )
}

/**
 * Remove everything a local import may have written, including the cover image
 * extracted before the book record exists.
 */
export async function deleteImportedBookFiles(
  bookUuid: UUID,
  coverUrl?: string,
) {
  await deleteLocalBookFiles(bookUuid)

  if (coverUrl) {
    await FileSystem.deleteAsync(coverUrl, { idempotent: true })
  }
}

/**
 * Remove what a finished local import does not need at runtime: the archive the
 * book was unpacked from, since reading reads the extracted tree, and for a
 * plain EPUB the readaloud copies that were duplicated before the book turned
 * out to have no media overlays. The file the user pointed the picker at is
 * never touched — only the copy made inside the app directory.
 */
export async function deleteImportScratchFiles(
  bookUuid: UUID,
  format: "ebook" | "readaloud",
) {
  const deletions = [
    FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, format), {
      idempotent: true,
    }),
  ]

  if (format === "ebook") {
    deletions.push(
      FileSystem.deleteAsync(getLocalBookExtractedUrl(bookUuid, "readaloud"), {
        idempotent: true,
      }),
      FileSystem.deleteAsync(getLocalBookArchiveUrl(bookUuid, "readaloud"), {
        idempotent: true,
      }),
    )
  }

  await Promise.all(deletions)
  await deleteEmptyBookDirectories(bookUuid)
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
