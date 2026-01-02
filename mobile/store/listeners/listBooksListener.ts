import { Directory, File } from "expo-file-system"
import { Image } from "expo-image"
import * as SecureStore from "expo-secure-store"

import { type BookWithRelations as ServerBook } from "@storyteller-platform/web/src/database/books"

import {
  type BookWithRelations,
  deleteBook,
  deleteBooks,
  detachBooksFromServer,
  getBook,
  getBooksWithAnnotations,
} from "@/database/books"
import { getBookPosition } from "@/database/positions"
import {
  createBookFromServer,
  trimDeletedServerBooks,
  upsertServerBooks,
} from "@/database/serverBooks"
import { getServer } from "@/database/servers"
import { localApi } from "@/store/localApi"
import {
  getLocalAudioBookCoverUrl,
  getLocalBookArchiveUrl,
  getLocalBookCoverUrl,
  getLocalBookExtractedUrl,
} from "@/store/persistence/files"
import { getCoverUrl, serverApi } from "@/store/serverApi"
import { type UUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

const running = new Set<UUID>()

startAppListening({
  matcher: serverApi.endpoints.listBooks.matchFulfilled,
  effect: async (action, listenerApi) => {
    const { serverUuid } = action.meta.arg.originalArgs
    if (running.has(serverUuid)) return
    running.add(serverUuid)

    try {
      const server = await getServer(serverUuid)

      const serverBooks = action.payload
      const serverUuids = new Set(serverBooks.map(({ uuid }) => uuid))

      const localBooks = await getBooksWithAnnotations()
      const localBookIds = new Map<number, UUID>()
      const localBookUuids = new Set<UUID>()

      const deletedLocalBooks: UUID[] = []
      const preservedDeletedBooks: UUID[] = []

      for (const book of localBooks) {
        if (
          book.id &&
          (book.serverUuid === null || book.serverUuid === serverUuid)
        ) {
          localBookIds.set(book.id, book.uuid)
        }
        localBookUuids.add(book.uuid)

        if (book.serverUuid === server.uuid && !serverUuids.has(book.uuid)) {
          if (
            book.audiobook?.downloadStatus === "DOWNLOADED" ||
            book.ebook?.downloadStatus === "DOWNLOADED" ||
            book.readaloud?.downloadStatus === "DOWNLOADED" ||
            book.bookmarks.length ||
            book.highlights.length
          ) {
            preservedDeletedBooks.push(book.uuid)
          } else {
            deletedLocalBooks.push(book.uuid)
          }
        }
      }

      await deleteBooks(deletedLocalBooks)
      await detachBooksFromServer(server, preservedDeletedBooks)

      const newServerBooks: ServerBook[] = []
      const patchedServerBooks: ServerBook[] = []
      const existingBooks: ServerBook[] = []
      const collections = new Map<UUID, ServerBook["collections"][number]>()
      const creators = new Map<UUID, ServerBook["creators"][number]>()
      const series = new Map<UUID, ServerBook["series"][number]>()

      for (const book of serverBooks) {
        for (const author of book.authors) {
          creators.set(author.uuid, { ...author, role: "aut" })
        }
        for (const narrator of book.narrators) {
          creators.set(narrator.uuid, { ...narrator, role: "nrt" })
        }
        for (const creator of book.creators) {
          creators.set(creator.uuid, creator)
        }

        for (const collection of book.collections) {
          collections.set(collection.uuid, collection)
        }

        for (const s of book.series) {
          series.set(s.uuid, s)
        }

        if (localBookUuids.has(book.uuid)) {
          existingBooks.push(book)
          continue
        }

        if (book.id && localBookIds.has(book.id)) {
          patchedServerBooks.push(book)
          continue
        }

        newServerBooks.push(book)
      }

      await upsertServerBooks(newServerBooks, server.uuid)

      for (const book of patchedServerBooks) {
        const oldUuid = localBookIds.get(book.id!)!
        const position = await getBookPosition(oldUuid)
        const localBook = await getBook(oldUuid)
        await deleteBook(oldUuid)
        let serverPosition = { ...book.position }
        if (position) {
          serverPosition ??= {
            createdAt: position.createdAt,
            updatedAt: position.updatedAt,
            locator: position.locator,
            timestamp: position.timestamp,
            uuid: position.uuid,
          }
          serverPosition.timestamp = position.timestamp
          serverPosition.locator = position.locator
        }

        await createBookFromServer(
          server.uuid,
          {
            ...book,
            position: serverPosition as BookWithRelations["position"],
          },
          localBook?.readaloud?.downloadStatus === "DOWNLOADED",
        )

        const oldBookCover = new File(getLocalBookCoverUrl(oldUuid))
        if (oldBookCover.exists) {
          oldBookCover.delete()
        }

        const oldAudioBookCover = new File(getLocalAudioBookCoverUrl(oldUuid))
        if (oldAudioBookCover.exists) {
          oldAudioBookCover.delete()
        }

        const oldReadaloudArchive = new File(
          getLocalBookArchiveUrl(oldUuid, "readaloud"),
        )
        if (oldReadaloudArchive.exists) {
          const newArchiveUrl = getLocalBookArchiveUrl(book.uuid, "readaloud")
          const newArchiveFile = new File(newArchiveUrl)
          newArchiveFile.parentDirectory.create({
            idempotent: true,
            intermediates: true,
          })
          oldReadaloudArchive.move(newArchiveFile)
        }

        const oldAudiobookArchive = new Directory(
          getLocalBookArchiveUrl(oldUuid, "audiobook"),
        )
        if (oldAudiobookArchive.exists) {
          const newAudiobookArchiveUrl = getLocalBookArchiveUrl(
            book.uuid,
            "audiobook",
          )
          const newAudiobookArchiveFile = new File(newAudiobookArchiveUrl)
          newAudiobookArchiveFile.parentDirectory.create({
            idempotent: true,
            intermediates: true,
          })
          oldAudiobookArchive.move(newAudiobookArchiveFile)
        }

        const oldEbookArchive = new File(
          getLocalBookArchiveUrl(oldUuid, "ebook"),
        )
        if (oldEbookArchive.exists) {
          const newEbookArchiveUrl = getLocalBookArchiveUrl(book.uuid, "ebook")
          const newEbookArchiveFile = new File(newEbookArchiveUrl)
          newEbookArchiveFile.parentDirectory.create({
            idempotent: true,
            intermediates: true,
          })
          oldEbookArchive.move(newEbookArchiveFile)
        }

        const oldExtractedReadaloud = new Directory(
          getLocalBookExtractedUrl(oldUuid, "readaloud"),
        )
        if (oldExtractedReadaloud.exists) {
          const newExtractedReadaloudUrl = getLocalBookExtractedUrl(
            book.uuid,
            "readaloud",
          )
          const newExtractedReadaloudDirectory = new Directory(
            newExtractedReadaloudUrl,
          )
          newExtractedReadaloudDirectory.parentDirectory.create({
            idempotent: true,
            intermediates: true,
          })
          oldExtractedReadaloud.move(newExtractedReadaloudDirectory)
        }

        const oldExtractedEbook = new Directory(
          getLocalBookExtractedUrl(oldUuid, "ebook"),
        )
        if (oldExtractedEbook.exists) {
          const newExtractedEbookUrl = getLocalBookExtractedUrl(
            book.uuid,
            "ebook",
          )
          const newExtractedEbookDirectory = new Directory(newExtractedEbookUrl)
          newExtractedEbookDirectory.parentDirectory.create({
            idempotent: true,
            intermediates: true,
          })
          oldExtractedEbook.move(newExtractedEbookDirectory)
        }

        const oldExtractedAudiobook = new Directory(
          getLocalBookExtractedUrl(oldUuid, "audiobook"),
        )
        if (oldExtractedAudiobook.exists) {
          const newExtractedAudiobookUrl = getLocalBookExtractedUrl(
            book.uuid,
            "audiobook",
          )
          const newExtractedAudiobookDirectory = new Directory(
            newExtractedAudiobookUrl,
          )
          newExtractedAudiobookDirectory.parentDirectory.create({
            idempotent: true,
            intermediates: true,
          })
          oldExtractedAudiobook.move(newExtractedAudiobookDirectory)
        }
      }

      const accessToken = (await SecureStore.getItemAsync(
        `server.${server.uuid}.token`,
      ))!

      Image.prefetch(
        serverBooks.flatMap((book) => [
          getCoverUrl(server.baseUrl, book.uuid, { height: 352, width: 232 }),
          getCoverUrl(server.baseUrl, book.uuid, {
            height: 232,
            width: 232,
            audio: true,
          }),
        ]),
        {
          cachePolicy: "disk",
          headers: { Authorization: `Bearer: ${accessToken}` },
        },
      )

      await upsertServerBooks(existingBooks, server.uuid)

      await trimDeletedServerBooks(serverBooks, serverUuid)

      listenerApi.dispatch(
        localApi.util.invalidateTags([
          "Books",
          "Collections",
          "Creators",
          "Series",
          "Servers",
          "Tags",
        ]),
      )
    } finally {
      running.delete(serverUuid)
    }
  },
})
