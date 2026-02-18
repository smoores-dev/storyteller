import { Directory, File } from "expo-file-system"
import * as FileSystem from "expo-file-system/legacy"
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake"
import * as SecureStore from "expo-secure-store"
import { sql } from "kysely"

import { getBook } from "@/database/books"
import { db, rawDb } from "@/database/db"
import { getServer } from "@/database/servers"
import { logger } from "@/logger"
import {
  type ReadiumManifest,
  Storyteller,
  buildAudiobookManifest,
  extractArchive,
  getPositions,
  openPublication,
} from "@/modules/readium"
import type {
  ReadiumClip,
  ReadiumLocator,
} from "@/modules/readium/src/Readium.types"
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
    }

    listenerApi.unsubscribe()

    try {
      const { bookUuid, format } = action.meta.arg.originalArgs

      logger.debug(`Starting download for ${bookUuid} (${format})`)
      const book = (await getBook(bookUuid))!
      if (!book.serverUuid) {
        throw new Error(
          `Attempted to download a book that did not originate from a server`,
        )
      }

      logger.debug(`Getting server for ${bookUuid} (${format})`)
      const server = await getServer(book.serverUuid)
      const token = await SecureStore.getItemAsync(
        `server.${server.uuid}.token`,
      )

      logger.debug(`Getting local book archive URI for ${bookUuid} (${format})`)
      const localBookArchiveUri = getLocalBookArchiveUrl(book.uuid, format)

      logger.debug(`Creating parent directory for ${localBookArchiveUri}`)
      new File(localBookArchiveUri).parentDirectory.create({
        idempotent: true,
        intermediates: true,
      })

      logger.debug(`Creating download resumable for ${bookUuid} (${format})`)
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
          logger.debug(
            `Progress: ${progressData.totalBytesWritten} / ${progressData.totalBytesExpectedToWrite}`,
          )
          const progress = Math.round(
            (progressData.totalBytesWritten /
              progressData.totalBytesExpectedToWrite) *
              100,
          )
          logger.debug(`Progress: ${progress}`)
          await db.transaction().execute(async (tr) => {
            logger.debug(`Updating download status for ${bookUuid} (${format})`)
            const { downloadStatus } = await tr
              .selectFrom(format)
              .select(["downloadStatus"])
              .where("bookUuid", "=", bookUuid)
              .executeTakeFirstOrThrow()
            if (downloadStatus === "DOWNLOADED") return

            logger.debug(`Updating download status for ${bookUuid} (${format})`)
            await tr
              .updateTable(format)
              .set({
                downloadStatus: "DOWNLOADING",
                downloadProgress: progress,
              })
              .where("bookUuid", "=", bookUuid)
              .execute()
          })

          logger.debug(
            `Updating cached download state for ${bookUuid} (${format})`,
          )
          updateCachedDownloadState({
            downloadStatus: "DOWNLOADING",
            downloadProgress: progress,
          })

          logger.debug(`Downloading...`)

          // TODO: Support pausing
        }, 250),
      )

      const cancelTask = listenerApi.fork(async () => {
        const [action] = await listenerApi.take(
          localApi.endpoints.cancelDownload.matchPending,
        )

        const { bookUuid: cancelledBookUuid, format: cancelledFormat } =
          action.meta.arg.originalArgs

        if (bookUuid !== cancelledBookUuid || format !== cancelledFormat) return

        await download.cancelAsync()
      })

      logger.debug(`Activating keep awake for ${bookUuid} (${format})`)
      await activateKeepAwakeAsync(`download.${bookUuid}.${format}`)
      logger.debug(`Starting download for ${bookUuid} (${format})`)
      const result = await download.downloadAsync()
      cancelTask.cancel()

      if (!result) {
        logger.debug(`Download cancelled for ${bookUuid} (${format})`)
        deactivateKeepAwake(`download.${bookUuid}.${format}`)
        listenerApi.subscribe()
        return
      }

      logger.debug(`Download complete for ${bookUuid} (${format})`)
      logger.debug(`Extracting archive for ${bookUuid} (${format})`)

      const localExtractedUri = getLocalBookExtractedUrl(bookUuid, format)
      logger.debug(`Getting extracted directory for ${localExtractedUri}`)
      const extractedDirectory = new Directory(localExtractedUri)
      logger.debug(
        `Checking if extracted directory exists for ${localExtractedUri}`,
      )
      if (extractedDirectory.exists) {
        extractedDirectory.delete()
      }
      logger.debug(`Creating extracted directory for ${localExtractedUri}`)
      extractedDirectory.create({
        idempotent: true,
        intermediates: true,
      })

      logger.debug(
        `Extracting archive for ${localBookArchiveUri} to ${extractedDirectory.uri}`,
      )
      await extractArchive(localBookArchiveUri, extractedDirectory.uri)

      new File(localBookArchiveUri).delete()

      if (format === "audiobook") {
        logger.debug(`Reading audiobook manifest for ${bookUuid} (${format})`)
        const manifestFile = new File(
          extractedDirectory,
          "manifest.audiobook-manifest",
        )
        const manifestText = await manifestFile.text()
        const manifest = JSON.parse(manifestText) as ReadiumManifest

        logger.debug(`Updating audiobook manifest for ${bookUuid} (${format})`)
        await db
          .updateTable("audiobook")
          .set({
            manifest: JSON.stringify(manifest) as unknown as ReadiumManifest,
          })
          .where("bookUuid", "=", bookUuid)
          .execute()
      } else {
        logger.debug(`Reading EPUB manifest`)
        const epubManifest = await openPublication(
          bookUuid,
          getLocalBookExtractedUrl(bookUuid, format),
        )
        logger.debug(`Building audiobook manifest`)
        const audioManifest = await buildAudiobookManifest(bookUuid)
        logger.debug("Retrieving overlay clips")
        const clips = await Storyteller.getOverlayClips(bookUuid)
        logger.debug("Retrieving positions")
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
                  clips: JSON.stringify(clips) as unknown as ReadiumClip[],
                }),
            positions: JSON.stringify(positions) as unknown as ReadiumLocator[],
          })
          .where("bookUuid", "=", bookUuid)
          .execute()

        logger.debug("Cached publication metadata in local db")

        if (!book.position) {
          logger.debug(`No local position for book, starting at beginning`)
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

      await rawDb.flushPendingReactiveQueries()

      updateCachedDownloadState({
        downloadStatus: "DOWNLOADED",
        downloadProgress: 100,
      })
      deactivateKeepAwake(`download.${bookUuid}.${format}`)
      logger.debug(`Download complete`)

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
      logger.error({ err: e })
      const { bookUuid, format } = action.meta.arg.originalArgs

      await db
        .updateTable(format)
        .set({ downloadStatus: "ERROR" })
        .where("bookUuid", "=", bookUuid)
        .execute()

      await rawDb.flushPendingReactiveQueries()

      updateCachedDownloadState({
        downloadStatus: "ERROR",
      })

      listenerApi.subscribe()
    }
  },
})
