import { randomBytes } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { basename, dirname, extname } from "node:path"

import { FileStore } from "@tus/file-store"
import { Server } from "@tus/server"
import { lookup } from "mime-types"
import { type NextRequest } from "next/server"

import { Audiobook } from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { move, persistAudio, persistEpub } from "@/assets/fs"
import { scanBooks } from "@/assets/library/scanner/scan"
import {
  getInternalAudioDirectory,
  getInternalOriginalAudioFilepath,
} from "@/assets/paths"
import { isAudioFile, isZipArchive, lookupAudioMime } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import {
  type BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
  getBook,
  updateBook,
} from "@/database/books"
import { UPLOADS_DIR } from "@/directories"
import { isEpubVersionError } from "@/epub"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

/* the default naming func found in @tus/server */
const defaultNamingFunc = () => randomBytes(16).toString("hex")

async function openOrUpgradeEpub(uploadPath: string): Promise<Epub> {
  try {
    return await Epub.from(uploadPath)
  } catch (e) {
    if (!isEpubVersionError(e)) throw e
    logger.info(`Uploaded EPUB is not EPUB 3, auto-converting to EPUB 3`)
    using upgraded = await Epub.upgrade(uploadPath)
    await upgraded.saveAndClose()
    return await Epub.from(uploadPath)
  }
}

async function ingestEpub(
  bookUuid: UUID,
  filename: string,
  uploadPath: string,
  collectionUuid: UUID | undefined,
): Promise<BookWithRelations> {
  using epub = await openOrUpgradeEpub(uploadPath)
  const manifest = await epub.getManifest()
  const isAligned = Object.values(manifest).some((item) => item.mediaOverlay)

  const existing = await getBook(bookUuid)
  if (existing) {
    const persisted = await persistEpub(existing, uploadPath, isAligned)
    if (!persisted.audiobook) return persisted

    // when audio uploads happened first, the book dir is keyed by an
    // arbitrary placeholder name; re-anchor it under the ebook-derived one.
    await move(
      getInternalAudioDirectory(existing),
      getInternalAudioDirectory(persisted),
    )
    return await updateBook(persisted.uuid, null, {
      audiobook: { filepath: getInternalAudioDirectory(persisted) },
    })
  }

  const book = await createBookFromEpub(
    epub,
    { uuid: bookUuid, title: basename(filename, ".epub") },
    {
      ...(collectionUuid && { collections: [collectionUuid] }),
    },
  )
  return await persistEpub(book, uploadPath, isAligned)
}

async function ingestAudiobook(
  bookUuid: UUID,
  relativePath: string,
  uploadPath: string,
  collectionUuid: UUID | undefined,
): Promise<BookWithRelations> {
  const existing = await getBook(bookUuid)
  if (existing) {
    const filepath = getInternalOriginalAudioFilepath(existing, relativePath)
    await mkdir(dirname(filepath), { recursive: true })

    let updated: BookWithRelations | null = null
    if (!existing.audiobook) {
      updated = await updateBook(existing.uuid, null, {
        audiobook: { filepath: getInternalOriginalAudioFilepath(existing) },
      })
    }
    await move(uploadPath, filepath)
    return updated ?? existing
  }

  using audiobook = await Audiobook.from(uploadPath)
  const book = await createBookFromAudiobook(
    audiobook,
    {
      uuid: bookUuid,
      title: basename(relativePath, extname(relativePath)),
    },
    {
      ...(collectionUuid && { collections: [collectionUuid] }),
    },
  )
  audiobook.discardAndClose()
  return await persistAudio(book, uploadPath, relativePath)
}

const server = new Server({
  path: "/api/v2/books/upload",
  respectForwardedHeaders: true,
  onResponseError(_req, err) {
    if ("status_code" in err && err.status_code === 404) return undefined
    logger.error(`Upload server encountered error`)
    logger.error(err)
    return undefined
  },
  datastore: new FileStore({ directory: UPLOADS_DIR }),
  namingFunction(_req, metadata) {
    if (!metadata?.["filename"]) return defaultNamingFunc()
    const extension = extname(metadata["filename"])
    if (!extension) return defaultNamingFunc()
    return `${defaultNamingFunc()}${extension}`
  },
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
        (filetype.startsWith("application/epub") || filetype === "image/epub")
      const isAudiobook = isAudioFile(filename) || isZipArchive(filename)
      if (!isEpub && !isAudiobook) {
        return {
          status_code: 405,
          body: `Invalid upload type. Expected application/epub+zip, audio/*, or video/mp4, received "${upload.metadata["filetype"]}" from browser and "${lookupAudioMime(filename) ?? lookup(filename)}" from extension`,
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const uploadPath = upload.storage!.path

      let book: BookWithRelations | null = null
      if (isEpub) {
        book = await ingestEpub(bookUuid, filename, uploadPath, collectionUuid)
      } else if (isAudiobook) {
        const relativePath =
          upload.metadata["relativePath"] === "null" ||
          !upload.metadata["relativePath"]
            ? filename
            : upload.metadata["relativePath"]
        book = await ingestAudiobook(
          bookUuid,
          relativePath,
          uploadPath,
          collectionUuid,
        )
      }

      if (book) {
        await scanBooks({
          source: "upload",
          bookUuids: [book.uuid],
          options: { force: true },
          signal: new AbortController().signal,
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
