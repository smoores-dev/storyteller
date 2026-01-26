import { type MessagePort } from "node:worker_threads"

import { Epub } from "@storyteller-platform/epub"

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
    logger.info(`Writing metadata to epub ${book.title} ${book.suffix}`)
    try {
      using epub = await Epub.from(book.ebook.filepath)
      await writeMetadataToEpub(book, epub, { textCover })
      await epub.saveAndClose()
      logger.info("Epub saved")
    } catch (e) {
      logger.error({
        err: e,
        msg: `Failed to write metadata to epub ${book.title} ${book.suffix}, skipping`,
      })
    }
  }

  if (book.audiobook) {
    logger.info(`Writing metadata to audiobook ${book.title} ${book.suffix}`)
    await writeMetadataToAudiobook(book, audioCover)
    logger.info("Audiobook saved")
  }

  if (book.readaloud?.filepath) {
    logger.info(`Writing metadata to readaloud ${book.title} ${book.suffix}`)
    try {
      using epub = await Epub.from(book.readaloud.filepath)
      await writeMetadataToEpub(book, epub, { textCover, audioCover })
      await epub.saveAndClose()
      logger.info("Readaloud saved")
    } catch (e) {
      logger.error(
        `Failed to write metadata to readaloud ${book.title} ${book.suffix}, skipping`,
      )
      logger.error(e)
    }
  }

  if (textCover || audioCover) {
    await deleteCachedCoverImages(bookUuid)
  }
}
