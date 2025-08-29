import { deleteCachedCoverImages } from "@/assets/fs"
import { getBookOrThrow } from "@/database/books"
import {
  writeMetadataToEpub,
  writeMetadataToAudiobook,
} from "@/assets/metadata"
import { UUID } from "@/uuid"
import { Epub } from "@smoores/epub/node"
import { MessagePort } from "node:worker_threads"

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
    const epub = await Epub.from(book.ebook.filepath)
    await writeMetadataToEpub(book, epub, { textCover })
    await epub.writeToFile(book.ebook.filepath)
    await epub.close()
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
