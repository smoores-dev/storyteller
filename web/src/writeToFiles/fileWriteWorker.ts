import { randomUUID } from "node:crypto"
import { type MessagePort } from "node:worker_threads"

import { Epub } from "@storyteller-platform/epub"

import { deleteCachedCoverImages } from "@/assets/fs"
import {
  fingerprintAudiobookDirectory,
  fingerprintFile,
} from "@/assets/library/fingerprint"
import {
  writeMetadataToAudiobook,
  writeMetadataToEpub,
} from "@/assets/metadata"
import { type BookRelationsUpdate, getBookOrThrow } from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

interface TransferableFile {
  name: string
  type: string
  arrayBuffer: ArrayBuffer
}

export type FileWriteWorkerMessage =
  | { type: "started"; bookUuid: UUID }
  | {
      type: "updateBook"
      requestId: UUID
      bookUuid: UUID
      relations: BookRelationsUpdate
    }

function createPortRpc(port: MessagePort) {
  return async function send(message: {
    type: "updateBook"
    bookUuid: UUID
    relations: BookRelationsUpdate
  }) {
    const requestId = randomUUID()
    const promise = new Promise<void>((resolve) => {
      function listener(msg: { requestId: string }) {
        if (msg.requestId !== requestId) return
        port.off("message", listener)
        resolve()
      }
      port.on("message", listener)
    })
    port.postMessage({ ...message, requestId })
    return promise
  }
}

export type WriteMetadataToFilesInput = {
  bookUuid: UUID
  textCover: TransferableFile | undefined
  audioCover: TransferableFile | undefined
  port: MessagePort
}

if (process.env["DEBUG_FILE_WRITE_WORKER"] === "true") {
  void import("node:inspector").then(({ default: inspector }) =>
    inspector.open(9232, "0.0.0.0", true),
  )
}
export default async function writeMetadataToFiles({
  bookUuid,
  textCover: transferableTextCover,
  audioCover: transferableAudioCover,
  port,
}: WriteMetadataToFilesInput) {
  port.postMessage({ type: "started", bookUuid })
  const send = createPortRpc(port)
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
    logger.info(`Writing metadata to epub ${book.title} ${book.assetDir}`)
    try {
      using epub = await Epub.from(book.ebook.filepath)
      await writeMetadataToEpub(book, epub, { textCover })
      await epub.saveAndClose()
      logger.info("Epub saved")

      const { fileSize, fingerprint } = await fingerprintFile(
        book.ebook.filepath,
      )
      await send({
        type: "updateBook",
        bookUuid: book.uuid,
        relations: {
          ebook: {
            filepath: book.ebook.filepath,
            fileSize,
            fingerprint,
          },
        },
      })
    } catch (e) {
      logger.error({
        err: e,
        msg: `Failed to write metadata to epub ${book.title} ${book.assetDir}, skipping`,
      })
    }
  }

  if (book.audiobook) {
    logger.info(`Writing metadata to audiobook ${book.title} ${book.assetDir}`)
    await writeMetadataToAudiobook(book, audioCover)
    logger.info("Audiobook saved")

    try {
      const { fileSize, fingerprint } = await fingerprintAudiobookDirectory(
        book.audiobook.filepath,
      )
      await send({
        type: "updateBook",
        bookUuid: book.uuid,
        relations: {
          audiobook: {
            filepath: book.audiobook.filepath,
            fileSize,
            fingerprint,
          },
        },
      })
    } catch (e) {
      logger.error({
        err: e,
        msg: `Failed to update audiobook hash for ${book.title} ${book.assetDir}`,
      })
    }
  }

  if (book.readaloud?.filepath) {
    logger.info(`Writing metadata to readaloud ${book.title} ${book.assetDir}`)
    try {
      using epub = await Epub.from(book.readaloud.filepath)
      await writeMetadataToEpub(book, epub, { textCover, audioCover })
      await epub.saveAndClose()
      logger.info("Readaloud saved")

      const { fileSize, fingerprint } = await fingerprintFile(
        book.readaloud.filepath,
      )
      await send({
        type: "updateBook",
        bookUuid: book.uuid,
        relations: {
          readaloud: {
            filepath: book.readaloud.filepath,
            fileSize,
            fingerprint,
            currentStage: book.readaloud.currentStage,
          },
        },
      })
    } catch (e) {
      logger.error(
        `Failed to write metadata to readaloud ${book.title} ${book.assetDir}, skipping`,
      )
      logger.error(e)
    }
  }

  if (textCover || audioCover) {
    try {
      await deleteCachedCoverImages(bookUuid)
    } catch (e) {
      logger.error({
        msg: "Failed to delete cached cover images",
        bookUuid,
        err: e,
      })
    }
  }
}
