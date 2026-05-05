import { join } from "node:path"
import { cwd } from "node:process"
import { MessageChannel } from "node:worker_threads"

import Piscina, { transferableSymbol, valueSymbol } from "piscina"

import {
  suppressPrefix,
  unsuppressPrefix,
} from "@/assets/library/scanner/write-intent"
import { getBook, updateBook } from "@/database/books"
import { env } from "@/env"
import { logger } from "@/logging"
import type { UUID } from "@/uuid"

import type {
  FileWriteWorkerMessage,
  WriteMetadataToFilesInput,
} from "./fileWriteWorker"

/**
 * Next.js app directory seems to have a bug where, in production,
 * a single module can be imported multiple times (breaking the module
 * cache) if it's depended on by different modules that end up in different
 * bundled chunks.
 *
 * This results in multiple instances of the module level values in this
 * module, all of which rely on being singletons to work correctly.
 */
declare global {
  // variables declared with const/let cannot be added to the global scope
  /* eslint-disable no-var */
  var fileWriteQueue: UUID[] | undefined
  var fileWritePiscina: Piscina | undefined
  /* eslint-enable no-var */
}

let fileWriteQueue: UUID[]
if (globalThis.fileWriteQueue) {
  fileWriteQueue = globalThis.fileWriteQueue
} else {
  fileWriteQueue = []
  globalThis.fileWriteQueue = fileWriteQueue
}

const filename = join(
  cwd(),
  "file-write-dist",
  env.STORYTELLER_FILE_WRITE_WORKER,
)

let fileWritePiscina: Piscina
if (globalThis.fileWritePiscina) {
  fileWritePiscina = globalThis.fileWritePiscina
} else {
  fileWritePiscina = new Piscina({
    filename,
    minThreads: 0,
    maxThreads: 1,
    idleTimeout: 30_000,
    // In dev, we don't bundle packages in the worker.
    // These flags allow us to import directly from the
    // source typescript files for our own packages (e.g. @storyteller-platform/epub)
    ...(env.NODE_ENV === "development" && {
      env: {
        ...process.env,
        NODE_OPTIONS:
          "--conditions=@storyteller-node --disable-warning=ExperimentalWarning --experimental-transform-types",
      },
    }),
  })
  globalThis.fileWritePiscina = fileWritePiscina
}

export function cancelProcessing(bookUuid: UUID) {
  const index = fileWriteQueue.findIndex((enqueued) => bookUuid === enqueued)
  if (index === -1) return
  fileWriteQueue.splice(index, 1)
}

export async function queueWritesToFiles(
  bookUuid: UUID,
  textCover?: File,
  audioCover?: File,
) {
  if (fileWriteQueue.includes(bookUuid)) return

  fileWriteQueue.push(bookUuid)

  const { port1, port2 } = new MessageChannel()

  port2.on("message", async (message: FileWriteWorkerMessage) => {
    if (message.type === "started") {
      const index = fileWriteQueue.findIndex(
        (bookUuid) => bookUuid === message.bookUuid,
      )
      fileWriteQueue.splice(index, 1)
      return
    }

    try {
      await updateBook(message.bookUuid, null, message.relations)
    } catch (e) {
      logger.error({
        err: e,
        msg: `Failed to update book ${message.bookUuid} from file write worker`,
      })
    }
    port2.postMessage({ requestId: message.requestId })
  })

  const transferableTextCover = textCover && {
    name: textCover.name,
    type: textCover.type,
    arrayBuffer: await textCover.arrayBuffer(),

    get [transferableSymbol]() {
      return [this.arrayBuffer]
    },

    get [valueSymbol]() {
      return {
        name: this.name,
        type: this.type,
        arrayBuffer: this.arrayBuffer,
      }
    },
  }

  const transferableAudioCover = audioCover && {
    name: audioCover.name,
    type: audioCover.type,
    arrayBuffer: await audioCover.arrayBuffer(),

    get [transferableSymbol]() {
      return [this.arrayBuffer]
    },

    get [valueSymbol]() {
      return {
        name: this.name,
        type: this.type,
        arrayBuffer: this.arrayBuffer,
      }
    },
  }

  const book = await getBook(bookUuid)
  const filepaths: string[] = []
  if (book?.ebook?.filepath) filepaths.push(book.ebook.filepath)
  if (book?.readaloud?.filepath) filepaths.push(book.readaloud.filepath)

  const dirpaths: string[] = []
  if (book?.audiobook?.filepath) dirpaths.push(book.audiobook.filepath)

  for (const fp of filepaths) suppressPrefix(fp)
  for (const dp of dirpaths) suppressPrefix(dp)

  try {
    await fileWritePiscina.run(
      {
        bookUuid,
        textCover: transferableTextCover,
        audioCover: transferableAudioCover,
        port: port1,
      } satisfies WriteMetadataToFilesInput,
      { transferList: [port1] },
    )
  } finally {
    for (const fp of filepaths) unsuppressPrefix(fp)
    for (const dp of dirpaths) unsuppressPrefix(dp)
  }
}
