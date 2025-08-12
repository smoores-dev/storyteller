import { Server } from "@tus/server"
import { FileStore } from "@tus/file-store"
import { NextRequest } from "next/server"
import { withHasPermission } from "@/auth/auth"
import { UPLOADS_DIR } from "@/directories"
import {
  createBook,
  createBookFromEpub,
  getBook,
  updateBook,
} from "@/database/books"
import { lookup } from "mime-types"
import { isAudioFile } from "@/audio"
import { Epub } from "@smoores/epub/node"
import { basename, dirname, extname } from "node:path"
import { UUID } from "@/uuid"
import {
  getInternalBookDirectory,
  getInternalEpubAlignedFilepath,
  getInternalEpubFilepath,
  getInternalOriginalAudioFilepath,
} from "@/assets/paths"
import { persistAudio, persistEpub } from "@/assets/fs"
import { mkdir, readFile, rename, rm } from "node:fs/promises"
import { AsyncSemaphore } from "@esfx/async-semaphore"
import { Audiobook } from "@smoores/audiobook/node"
import { getMetadataFromEpub } from "@/process/processEpub"
import { logger } from "@/logging"

const mutex = new AsyncSemaphore(1)

const server = new Server({
  path: "/api/v2/books/upload",
  datastore: new FileStore({ directory: UPLOADS_DIR }),
  // TODO: check user permissions on specific book id here
  // ?: Is _req a NextRequest? Does it have auth.user?
  onUploadFinish: async (_req, upload) => {
    if (!upload.metadata) {
      return {
        status_code: 405,
        body: "Missing required file metadata: bookId, filename, filetype (optional)",
      }
    }

    await mutex.wait()

    try {
      const bookUuid = upload.metadata["bookUuid"] as UUID | undefined
      if (!bookUuid) {
        return { status_code: 405, body: "Missing required metadata: bookUuid" }
      }

      const filename = upload.metadata["filename"]
      if (!filename) {
        return { status_code: 405, body: "Missing required metadata: filename" }
      }

      const filetype = upload.metadata["filetype"] ?? lookup(filename)

      const collectionUuid = upload.metadata["collection"] as UUID | undefined

      const isEpub =
        filetype !== false && filetype.startsWith("application/epub")
      const isAudiobook = isAudioFile(filename)
      if (!isEpub && !isAudiobook) {
        return {
          status_code: 405,
          body: "Invalid upload type. Expected application/epub, audio/*, or video/mp4.",
        }
      }

      // This hook is only called when storage has been successfully set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const uploadPath = upload.storage!.path
      if (isEpub) {
        const epub = await Epub.from(uploadPath)
        const manifest = await epub.getManifest()
        const isAligned = Object.values(manifest).some(
          (item) => item.mediaOverlay,
        )

        let book = await getBook(bookUuid)
        if (book) {
          const { update, relations } = await getMetadataFromEpub(epub)
          Object.assign(
            relations,
            isAligned
              ? {
                  readaloud: {
                    status: "ALIGNED",
                    filepath: getInternalEpubAlignedFilepath(book),
                  },
                }
              : { ebook: { filepath: getInternalEpubFilepath(book) } },
          )

          const updated = await updateBook(book.uuid, update, relations)

          await persistEpub(book, uploadPath, isAligned)

          // If the audio was uploaded/processed first, it's going to
          // potentially have an arbitrary book directory name. Better
          // to use the one from the ebook
          await rename(
            getInternalBookDirectory(book),
            getInternalBookDirectory(updated),
          )
        } else {
          book = await createBookFromEpub(
            epub,
            { uuid: bookUuid, title: basename(filename, ".epub") },
            {
              ...(collectionUuid && { collections: [collectionUuid] }),
            },
          )

          await persistEpub(book, uploadPath, isAligned)
        }
      }

      if (isAudiobook) {
        const relativePath =
          upload.metadata["relativePath"] === "null" ||
          !upload.metadata["relativePath"]
            ? filename
            : upload.metadata["relativePath"]

        let book = await getBook(bookUuid)

        if (book) {
          const audiobook = await Audiobook.from(uploadPath)
          const narrators = await audiobook.getNarrators()
          audiobook.close()
          const filepath = getInternalOriginalAudioFilepath(book, relativePath)

          await mkdir(dirname(filepath), { recursive: true })

          if (!book.audiobook) {
            book = await updateBook(bookUuid, null, {
              ...(!book.narrators.length && {
                narrators: narrators,
              }),
              audiobook: {
                filepath: getInternalOriginalAudioFilepath(book),
              },
            })
          }

          await rename(uploadPath, filepath)
        } else {
          const data = await readFile(uploadPath)
          const audiobook = await Audiobook.from({
            data,
            filename: relativePath,
          })
          const title = await audiobook.getTitle()
          const description = await audiobook.getDescription()
          const authors = await audiobook.getAuthors()
          const narrators = await audiobook.getNarrators()
          audiobook.close()

          book = await createBook(
            {
              uuid: bookUuid,
              title: title ?? basename(filename, extname(filename)),
              description,
            },
            {
              ...(collectionUuid && {
                collections: [collectionUuid],
              }),
              ...(authors.length && {
                authors: authors.map((name) => ({ name, fileAs: name })),
              }),
              ...(narrators.length && {
                narrators: narrators,
              }),
            },
          )

          await persistAudio(book, uploadPath, relativePath)
        }
      }

      await rm(`${uploadPath}.json`)
      return {}
    } catch (e) {
      logger.error(e)
      throw e
    } finally {
      mutex.release()
    }
  },
})

export const GET = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
export const PATCH = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
export const POST = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
export const DELETE = withHasPermission("bookCreate")(
  async (req: NextRequest) => server.handleWeb(req),
)
export const OPTIONS = withHasPermission("bookCreate")(
  async (req: NextRequest) => server.handleWeb(req),
)
export const HEAD = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
