import { Server } from "@tus/server"
import { FileStore } from "@tus/file-store"
import { NextRequest } from "next/server"
import { withHasPermission } from "@/auth/auth"
import { UPLOADS_DIR } from "@/directories"
import {
  BookUpdate,
  createBook,
  createBookFromEpub,
  getBook,
  SeriesRelation,
  updateBook,
} from "@/database/books"
import { lookup } from "mime-types"
import { isAudioFile } from "@/audio"
import { Epub } from "@smoores/epub/node"
import { basename, dirname, extname } from "node:path"
import { UUID } from "@/uuid"
import {
  getInternalEpubAlignedFilepath,
  getInternalEpubFilepath,
  getInternalOriginalAudioFilepath,
} from "@/assets/paths"
import { persistAudio, persistEpub } from "@/assets/fs"
import { getDefaultStatus } from "@/database/statuses"
import { mkdir, rename } from "node:fs/promises"

const server = new Server({
  path: "/api/v2/books/upload",
  datastore: new FileStore({ directory: UPLOADS_DIR }),
  onUploadFinish: async (_req, upload) => {
    if (!upload.metadata) {
      return {
        status_code: 405,
        body: "Missing required file metadata: bookId, filename, filetype (optional)",
      }
    }

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

    const isEpub = filetype === "application/epub+zip"
    const isAudiobook = isAudioFile(filename)
    if (!isEpub && !isAudiobook) {
      return {
        status_code: 405,
        body: "Invalid upload type. Expected application/epub+zip, audio/*, or video/mp4.",
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
        let update: BookUpdate | null = null
        const series: SeriesRelation[] = []

        const publicationDate = await epub.getPublicationDate()
        if (publicationDate) {
          update ??= {}
          update.publicationDate = publicationDate.toISOString()
        }

        const description = await epub.getDescription()
        if (description) {
          update ??= {}
          update.description = description
        }

        const metadata = await epub.getMetadata()

        for (const entry of metadata) {
          if (
            entry.properties["property"] === "belongs-to-collection" &&
            entry.value
          ) {
            const typeEntry = metadata.find(
              (e) =>
                e.properties["refines"] === `#${entry.id}` &&
                entry.properties["property"] === "collection-type",
            )?.value

            if (typeEntry !== "series") continue

            const position = metadata.find(
              (e) =>
                e.properties["refines"] === `#${entry.id}` &&
                entry.properties["property"] === "group-position",
            )?.value

            series.push({
              name: entry.value,
              featured: true,
              ...(position && { position: parseFloat(position) }),
            })
          }

          if (
            entry.properties["property"] === "storyteller:version" &&
            entry.value
          ) {
            update ??= {}
            update.alignedByStorytellerVersion = entry.value
          }

          if (
            entry.properties["property"] ===
              "storyteller:media-overlays-modified" &&
            entry.value
          ) {
            update ??= {}
            update.alignedAt = entry.value
          }
        }

        await updateBook(book.uuid, update, {
          series,
          ...(isAligned
            ? {
                readaloud: {
                  status: "ALIGNED",
                  filepath: getInternalEpubAlignedFilepath(book),
                },
              }
            : { ebook: { filepath: getInternalEpubFilepath(book) } }),
        })

        await persistEpub(book, uploadPath, isAligned)
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
        const filepath = getInternalOriginalAudioFilepath(book, relativePath)

        await mkdir(dirname(filepath), { recursive: true })

        if (!book.audiobook) {
          book = await updateBook(bookUuid, null, {
            audiobook: {
              filepath: getInternalOriginalAudioFilepath(book),
            },
          })
        }

        await rename(uploadPath, filepath)
      } else {
        const defaultStatus = await getDefaultStatus()

        book = await createBook(
          {
            uuid: bookUuid,
            title: basename(filename, extname(filename)),
            statusUuid: defaultStatus.uuid,
          },
          { ...(collectionUuid && { collections: [collectionUuid] }) },
        )

        await persistAudio(book, uploadPath, relativePath)
      }
    }
    return {}
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
