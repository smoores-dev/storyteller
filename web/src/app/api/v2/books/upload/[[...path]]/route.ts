import { randomBytes } from "node:crypto"
import { rm } from "node:fs/promises"
import { extname } from "node:path"

import { AsyncSemaphore } from "@esfx/async-semaphore"
import { FileStore } from "@tus/file-store"
import { Server } from "@tus/server"
import { lookup } from "mime-types"
import { type NextRequest } from "next/server"

import { Audiobook } from "@storyteller-platform/audiobook/node"
import { Epub } from "@storyteller-platform/epub/node"

import {
  getAudioCover,
  getEpubCover,
  writeExtractedAudiobookCover,
  writeExtractedEbookCover,
} from "@/assets/covers"
import { isAudioFile, isZipArchive, lookupAudioMime } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { UPLOADS_DIR } from "@/directories"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  handleAudiobookExistingBook,
  handleAudiobookNewBook,
  handleEpubExistingBook,
  handleEpubNewBook,
} from "./uploadHandlers"

/* the default naming func found in @tus/server */
const defaultNamingFunc = () => randomBytes(16).toString("hex")

const mutex = new AsyncSemaphore(1)

const server = new Server({
  path: "/api/v2/books/upload",
  respectForwardedHeaders: true,
  datastore: new FileStore({ directory: UPLOADS_DIR }),
  // makes sure Audiobook.createFile() works, as it needs to find a filetype
  namingFunction(_req, metadata) {
    if (!metadata?.["filename"]) {
      return defaultNamingFunc()
    }

    const extension = extname(metadata["filename"])

    if (!extension) {
      return defaultNamingFunc()
    }

    return `${defaultNamingFunc()}${extension}`
  },
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

      const filetype =
        upload.metadata["filetype"] ??
        lookupAudioMime(filename) ??
        lookup(filename)

      const collectionUuid = upload.metadata["collection"] as UUID | undefined

      const isEpub =
        filetype !== false && filetype.startsWith("application/epub")
      const isAudiobook = isAudioFile(filename) || isZipArchive(filename)
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
          book = await handleEpubExistingBook(book, uploadPath, epub, isAligned)
        } else {
          book = await handleEpubNewBook(
            bookUuid,
            filename,
            uploadPath,
            epub,
            collectionUuid,
            isAligned,
          )
        }

        const epubCover = await getEpubCover(book)
        if (epubCover) {
          await writeExtractedEbookCover(
            book,
            epubCover.filename,
            epubCover.data,
          )
        }
        if (isAligned) {
          const audioCover = await getAudioCover(book)
          if (audioCover) {
            await writeExtractedAudiobookCover(
              book,
              audioCover.filename,
              audioCover.data,
            )
          }
        }
      }

      if (isAudiobook) {
        const relativePath =
          upload.metadata["relativePath"] === "null" ||
          !upload.metadata["relativePath"]
            ? filename
            : upload.metadata["relativePath"]

        let book = await getBook(bookUuid)

        const audiobook = await Audiobook.from(uploadPath)
        if (book) {
          book = await handleAudiobookExistingBook(
            book,
            relativePath,
            uploadPath,
            audiobook,
          )
        } else {
          book = await handleAudiobookNewBook(
            bookUuid,
            relativePath,
            uploadPath,
            audiobook,
            collectionUuid,
          )
        }
        audiobook.close()

        const audioCover = await getAudioCover(book)
        if (audioCover) {
          await writeExtractedAudiobookCover(
            book,
            audioCover.filename,
            audioCover.data,
          )
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
