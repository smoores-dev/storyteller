import { Directory, File } from "expo-file-system"
import * as FileSystem from "expo-file-system/legacy"
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake"
import * as SecureStore from "expo-secure-store"
import { sql } from "kysely"

import { getBook } from "@/database/books"
import { db } from "@/database/db"
import { getServer } from "@/database/servers"
import { logger } from "@/logger"
import {
  type ReadiumManifest,
  buildAudiobookManifest,
  extractArchive,
  getPositions,
  openPublication,
} from "@/modules/readium"
import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import { localApi } from "@/store/localApi"
import {
  getLocalBookArchiveUrl,
  getLocalBookExtractedUrl,
} from "@/store/persistence/files"
import { getDownloadUrl } from "@/store/serverApi"
import { throttle } from "@/throttle"
import { randomUUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  matcher: localApi.endpoints.downloadBook.matchFulfilled,
  effect: async (action, listenerApi) => {
    function updateCachedDownloadState(state: {
      downloadStatus?: "ERROR" | "DOWNLOADED" | "DOWNLOADING"
      downloadProgress?: number
    }) {
      const { bookUuid, format } = action.meta.arg.originalArgs

      listenerApi.dispatch(
        localApi.util.updateQueryData("getBook", { uuid: bookUuid }, (book) => {
          if (!book?.[format]) return
          Object.assign(book[format], state)
        }),
      )

      listenerApi.dispatch(
        localApi.util.updateQueryData("listBooks", undefined, (books) => {
          const book = books.find((book) => book.uuid === bookUuid)
          if (!book?.[format]) return
          Object.assign(book[format], state)
        }),
      )
    }

    listenerApi.unsubscribe()

    try {
      const { bookUuid, format } = action.meta.arg.originalArgs

      const book = await getBook(bookUuid)
      if (!book?.serverUuid) {
        throw new Error(
          `Attempted to download a book that did not originate from a server`,
        )
      }

      const server = await getServer(book.serverUuid)
      const token = await SecureStore.getItemAsync(
        `server.${server.uuid}.token`,
      )

      const localBookArchiveUri = getLocalBookArchiveUrl(book.uuid, format)

      new File(localBookArchiveUri).parentDirectory.create({
        idempotent: true,
        intermediates: true,
      })

      const download = FileSystem.createDownloadResumable(
        getDownloadUrl(server.baseUrl, bookUuid, format),
        localBookArchiveUri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(format === "audiobook" && {
              Accept: "application/audiobook+zip",
            }),
          },
        },
        throttle(async (progressData) => {
          const progress = Math.round(
            (progressData.totalBytesWritten /
              progressData.totalBytesExpectedToWrite) *
              100,
          )
          await db
            .updateTable(format)
            .set({
              downloadStatus: "DOWNLOADING",
              downloadProgress: progress,
            })
            .where("bookUuid", "=", bookUuid)
            .execute()

          updateCachedDownloadState({
            downloadStatus: "DOWNLOADING",
            downloadProgress: progress,
          })

          // TODO: Support pausing
        }, 250),
      )

      await activateKeepAwakeAsync(`download.${bookUuid}.${format}`)
      await download.downloadAsync()
      deactivateKeepAwake(`download.${bookUuid}.${format}`)

      const localExtractedUri = getLocalBookExtractedUrl(bookUuid, format)
      const extractedDirectory = new Directory(localExtractedUri)
      if (extractedDirectory.exists) {
        extractedDirectory.delete()
      }
      extractedDirectory.create({
        idempotent: true,
        intermediates: true,
      })

      await extractArchive(localBookArchiveUri, extractedDirectory.uri)

      new File(localBookArchiveUri).delete()

      if (format === "audiobook") {
        const manifestFile = new File(
          extractedDirectory,
          "manifest.audiobook-manifest",
        )
        const manifestText = await manifestFile.text()
        const manifest = JSON.parse(manifestText) as ReadiumManifest

        await db
          .updateTable("audiobook")
          .set({
            manifest: JSON.stringify(manifest) as unknown as ReadiumManifest,
          })
          .where("bookUuid", "=", bookUuid)
          .execute()
      } else {
        const epubManifest = await openPublication(
          bookUuid,
          getLocalBookExtractedUrl(bookUuid, format),
        )
        const audioManifest = await buildAudiobookManifest(bookUuid)
        const positions = await getPositions(bookUuid)

        await db
          .updateTable(format)
          .set({
            ...(format === "ebook"
              ? {
                  manifest: JSON.stringify(
                    epubManifest,
                  ) as unknown as ReadiumManifest,
                }
              : {
                  epubManifest: JSON.stringify(
                    epubManifest,
                  ) as unknown as ReadiumManifest,
                  audioManifest: JSON.stringify(
                    audioManifest,
                  ) as unknown as ReadiumManifest,
                }),
            positions: JSON.stringify(positions) as unknown as ReadiumLocator[],
          })
          .where("bookUuid", "=", bookUuid)
          .execute()

        if (!book.position) {
          await db
            .insertInto("position")
            .values({
              uuid: randomUUID(),
              bookUuid,
              locator: JSON.stringify(
                positions[0]!,
              ) as unknown as ReadiumLocator,
              timestamp: Date.now(),
            })
            .execute()
        }
      }

      await db
        .updateTable(format)
        .set({
          downloadProgress: 100,
          downloadStatus: "DOWNLOADED",
        })
        .where("bookUuid", "=", bookUuid)
        .execute()

      updateCachedDownloadState({
        downloadStatus: "DOWNLOADED",
        downloadProgress: 100,
      })

      listenerApi.dispatch(
        localApi.util.invalidateTags([{ type: "Books", id: bookUuid }]),
      )

      const next = await db
        .selectFrom("audiobook")
        .select([
          "bookUuid",
          "downloadQueuePosition",
          sql.lit("audiobook").as("format"),
        ])
        .where("audiobook.downloadStatus", "=", "QUEUED")
        .union(
          db
            .selectFrom("ebook")
            .select([
              "bookUuid",
              "downloadQueuePosition",
              sql.lit("ebook").as("format"),
            ])
            .where("ebook.downloadStatus", "=", "QUEUED"),
        )
        .union(
          db
            .selectFrom("readaloud")
            .select([
              "bookUuid",
              "downloadQueuePosition",
              sql.lit("readaloud").as("format"),
            ])
            .where("readaloud.downloadStatus", "=", "QUEUED"),
        )
        .orderBy("downloadQueuePosition", "asc")
        .limit(1)
        .executeTakeFirst()

      listenerApi.subscribe()

      if (next) {
        listenerApi.dispatch(
          localApi.endpoints.downloadBook.initiate({
            bookUuid: next.bookUuid,
            format: next.format as "readaloud" | "ebook" | "audiobook",
          }),
        )
      }
    } catch (e) {
      logger.error(`Failed to download book`)
      logger.error(e)
      const { bookUuid, format } = action.meta.arg.originalArgs

      await db
        .updateTable(format)
        .set({ downloadStatus: "ERROR" })
        .where("bookUuid", "=", bookUuid)
        .execute()

      updateCachedDownloadState({
        downloadStatus: "ERROR",
      })

      listenerApi.subscribe()
    }
  },
})
