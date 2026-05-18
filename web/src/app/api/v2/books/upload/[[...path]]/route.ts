import { randomBytes } from "node:crypto"
import { rm } from "node:fs/promises"
import { extname } from "node:path"

import { FileStore } from "@tus/file-store"
import { Server } from "@tus/server"
import { lookup } from "mime-types"
import { type NextRequest } from "next/server"

import { Audiobook } from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { scanBooks } from "@/assets/library/scanner/scan"
import { isAudioFile, isZipArchive, lookupAudioMime } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { UPLOADS_DIR } from "@/directories"
import { isEpubVersionError } from "@/epub"
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

const server = new Server({
  path: "/api/v2/books/upload",
  respectForwardedHeaders: true,
  onResponseError(_req, err) {
    // These are expected, this just means that the file
    // is being uploaded for the first time
    if ("status_code" in err && err.status_code === 404) {
      return undefined
    }
    logger.error(`Upload server encountered error`)
    logger.error(err)
    return undefined
  },
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
        filetype !== false &&
        (filetype.startsWith("application/epub") ||
          // For some baffling reason, Chrome on Windows thinks that
          // EPUBs are images
          filetype === "image/epub")
      const isAudiobook = isAudioFile(filename) || isZipArchive(filename)
      if (!isEpub && !isAudiobook) {
        return {
          status_code: 405,
          body: `Invalid upload type. Expected application/epub+zip, audio/*, or video/mp4, received "${upload.metadata["filetype"]}" from browser and "${lookupAudioMime(filename) ?? lookup(filename)}" from extension`,
        }
      }

      // This hook is only called when storage has been successfully set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const uploadPath = upload.storage!.path
      let book: Awaited<ReturnType<typeof getBook>> = null
      if (isEpub) {
        let epub: Epub

        try {
          epub = await Epub.from(uploadPath)
        } catch (e) {
          if (!isEpubVersionError(e)) throw e

          logger.info(`Uploaded EPUB is not EPUB 3, auto-converting to EPUB 3`)

          using upgraded = await Epub.upgrade(uploadPath)
          await upgraded.saveAndClose()

          epub = await Epub.from(uploadPath)
        }

        using _ = epub
        const manifest = await epub.getManifest()
        const isAligned = Object.values(manifest).some(
          (item) => item.mediaOverlay,
        )

        const existing = await getBook(bookUuid)
        if (existing) {
          book = await handleEpubExistingBook(existing, uploadPath, isAligned)
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
      }

      if (isAudiobook) {
        const relativePath =
          upload.metadata["relativePath"] === "null" ||
          !upload.metadata["relativePath"]
            ? filename
            : upload.metadata["relativePath"]

        const existing = await getBook(bookUuid)
        if (existing) {
          book = await handleAudiobookExistingBook(
            existing,
            relativePath,
            uploadPath,
          )
        } else {
          using audiobook = await Audiobook.from(uploadPath)
          book = await handleAudiobookNewBook(
            bookUuid,
            relativePath,
            uploadPath,
            audiobook,
            collectionUuid,
          )
          audiobook.discardAndClose()
        }
      }

      if (book) {
        const scanController = new AbortController()
        await scanBooks({
          source: "upload",
          bookUuids: [book.uuid],
          options: { force: true },
          signal: scanController.signal,
        })
      }

      return {}
    } catch (e) {
      logger.error(e)
      throw e
    } finally {
      if (upload.storage?.path) {
        await rm(upload.storage.path, { force: true })
        await rm(`${upload.storage.path}.json`, { force: true })
      }
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
