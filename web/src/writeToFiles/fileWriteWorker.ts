import { type MessagePort } from "node:worker_threads"

import { Epub } from "@storyteller-platform/epub/node"

import { deleteCachedCoverImages } from "@/assets/fs"
import {
  writeMetadataToAudiobook,
  writeMetadataToEpub,
} from "@/assets/metadata"
import { getBookOrThrow } from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

interface TransferableFile {
  name: string
  type: string
  arrayBuffer: ArrayBuffer
}

export default async function writeMetadataToFiles({
  bookUuid,
  textCover: transferableTextCover,
  audioCover: transferableAudioCover,
  port,
}: {
  bookUuid: UUID
  textCover: TransferableFile | undefined
  audioCover: TransferableFile | undefined
  port: MessagePort
}) {
  port.postMessage({ type: "started", bookUuid })
  const book = await getBookOrThrow(bookUuid)

  const textCover =
    transferableTextCover &&
    new File([transferableTextCover.arrayBuffer], transferableTextCover.name, {
      type: transferableTextCover.type,
    })

  const audioCover =
    transferableAudioCover &&
    new File(
      [transferableAudioCover.arrayBuffer],
      transferableAudioCover.name,
      {
        type: transferableAudioCover.type,
      },
    )

  if (book.ebook) {
    let epub: Epub | null = null
    try {
      epub = await Epub.from(book.ebook.filepath)
      await writeMetadataToEpub(book, epub, { textCover })
      await epub.writeToFile(book.ebook.filepath)
    } catch (e) {
      logger.error(
        `Failed to write metadata to epub ${book.title} ${book.suffix}, skipping`,
      )
      logger.error(e)
    } finally {
      await epub?.close()
    }
  }

  if (book.audiobook) {
    await writeMetadataToAudiobook(book, audioCover)
  }

  if (book.readaloud?.filepath) {
    const epub = await Epub.from(book.readaloud.filepath)
    await writeMetadataToEpub(book, epub, { textCover, audioCover })
    await epub.writeToFile(book.readaloud.filepath)
    await epub.close()
  }

  if (textCover || audioCover) {
    await deleteCachedCoverImages(bookUuid)
  }
}
