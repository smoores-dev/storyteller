import { UUID } from "@/uuid"
import { join } from "node:path"
import Piscina, { transferableSymbol, valueSymbol } from "piscina"
import { cwd } from "node:process"
import type writeMetadataToFiles from "./fileWriteWorker"
import { availableParallelism } from "node:os"
import { MessageChannel } from "node:worker_threads"

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
  process.env["STORYTELLER_FILE_WRITE_WORKER"] ?? "fileWriteWorker.cjs",
)

let fileWritePiscina: Piscina
if (globalThis.fileWritePiscina) {
  fileWritePiscina = globalThis.fileWritePiscina
} else {
  fileWritePiscina = new Piscina({
    filename,
    // Try to take up "the rest" of the available cores, after
    // subtracting half for image optimization, one for the main
    // thread, and another for alignment
    maxThreads: Math.max(1, availableParallelism() / 2 - 2),
    // In dev, we don't bundle packages in the worker.
    // These flags allow us to import directly from the
    // source typescript files for our own packages (e.g. @smoores/epub)
    ...(process.env.NODE_ENV === "development" && {
      env: {
        ...process.env,
        NODE_OPTIONS:
          "--disable-warning=ExperimentalWarning --experimental-transform-types",
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
  textCover?: File | undefined,
  audioCover?: File | undefined,
) {
  if (fileWriteQueue.includes(bookUuid)) return

  fileWriteQueue.push(bookUuid)

  const { port1, port2 } = new MessageChannel()

  port2.on("message", (event: { type: "started"; bookUuid: UUID }) => {
    const index = fileWriteQueue.findIndex(
      (bookUuid) => bookUuid === event.bookUuid,
    )
    fileWriteQueue.splice(index, 1)
  })

  const transferableTextCover = textCover && {
    name: textCover.name,
    type: textCover.type,
    arrayBuffer: await textCover.arrayBuffer(),

    get [transferableSymbol]() {
      return [this.arrayBuffer]
    },

    get [valueSymbol]() {
      return { name: this.name, type: this.type, arrayBuffer: this.arrayBuffer }
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
      return { name: this.name, type: this.type, arrayBuffer: this.arrayBuffer }
    },
  }

  await fileWritePiscina.run(
    {
      bookUuid,
      textCover: transferableTextCover,
      audioCover: transferableAudioCover,
      port: port1,
    } satisfies Parameters<typeof writeMetadataToFiles>[0],
    { transferList: [port1] },
  )
}
