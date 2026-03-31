import { File } from "expo-file-system"
import { documentDirectory, getContentUriAsync } from "expo-file-system/legacy"
import { Image } from "expo-image"
import { Platform } from "react-native"

import { type BookWithRelations } from "@/database/books"
import { db } from "@/database/db"
import { getServer } from "@/database/servers"
import { logger } from "@/logger"
import {
  type ReadiumManifest,
  Storyteller,
  getClip,
  openPublication,
} from "@/modules/readium"
import {
  type ReadiumClip,
  type ReadiumLocator,
  type StorytellerTrack,
} from "@/modules/readium/src/Readium.types"
import { localApi } from "@/store/localApi"
import {
  getLocalBookExtractedUrl,
  getLocalBookFileUrl,
} from "@/store/persistence/files"
import { getCoverUrl } from "@/store/serverApi"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"
import { randomUUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

async function generateTracks(
  book: BookWithRelations,
  format: "audiobook" | "readaloud",
): Promise<StorytellerTrack[]> {
  const server = book.serverUuid && (await getServer(book.serverUuid))
  const serverCoverUrl =
    server &&
    getCoverUrl(server.baseUrl, book.uuid, {
      height: 232,
      width: 232,
      audio: true,
    })

  let coverUri = book.audiobookCoverUrl
    ? new URL(book.audiobookCoverUrl, documentDirectory!).toString()
    : serverCoverUrl
      ? await Image.getCachePathAsync(serverCoverUrl)
      : null

  // Convert to content:// URI on Android for Android Auto compatibility
  if (coverUri && Platform.OS === "android") {
    try {
      coverUri = await getContentUriAsync(
        new URL(coverUri, "file://").toString(),
      )
    } catch {
      // pass
    }
  } else if (coverUri) {
    coverUri = new URL(coverUri, "file://").toString()
  }

  const manifest =
    format === "audiobook"
      ? book.audiobook?.manifest
      : book.readaloud?.audioManifest

  const audioLinks = manifest?.readingOrder ?? []

  return audioLinks.map((audioLink) => {
    const uri = encodeURI(
      getLocalBookFileUrl(book.uuid, format, audioLink.href),
    )

    return {
      bookUuid: book.uuid,
      title: audioLink.title ?? book.title,
      bookTitle: book.title,
      uri,
      duration: audioLink.duration!,
      author: book.authors.length
        ? book.authors.map((author) => author.name).join(", ")
        : null,
      narrator: book.narrators.length
        ? book.narrators.map((narrator) => narrator.name).join(", ")
        : null,
      coverUri,
      relativeUri: audioLink.href,
      mimeType: audioLink.type.replace(/; codecs=.*/, ""),
    }
  })
}

startAppListening({
  actionCreator: bookshelfSlice.actions.bookOpened,
  effect: async (action, listenerApi) => {
    listenerApi.cancelActiveListeners()

    const { bookUuid, format } = action.payload
    logger.debug(`Book opened: ${bookUuid}`)

    const {
      currentlyPlayingBookUuid: previouslyPlayingBookUuid,
      currentlyPlayingFormat: previouslyPlayingFormat,
      tracks: currentTracks,
    } = listenerApi.getOriginalState().bookshelf

    if (
      previouslyPlayingBookUuid === bookUuid &&
      previouslyPlayingFormat === format
    ) {
      logger.debug(`Book already opened and loaded, doing nothing`)
      listenerApi.dispatch(
        bookshelfSlice.actions.playerQueued({ tracks: currentTracks }),
      )
      return
    }

    // always unload to handle race conditions where a previous
    // swipe-away unload may still be in-flight
    logger.debug(`Unloading audio player before loading new book`)
    await Storyteller.pause()
    await Storyteller.unload()

    listenerApi.throwIfCancelled()

    let book = await listenerApi
      .dispatch(
        localApi.endpoints.getBook.initiate(
          { uuid: bookUuid },
          { subscribe: false },
        ),
      )
      .unwrap()

    if (!book) {
      listenerApi.dispatch(
        bookshelfSlice.actions.playerQueued({ tracks: currentTracks }),
      )
      return
    }

    listenerApi.throwIfCancelled()

    if (format === "audiobook") {
      if (!book.position) {
        logger.debug(
          "No local position for this audiobook, starting at beginning",
        )
        const manifestFile = new File(
          getLocalBookExtractedUrl(book.uuid, format),
          "manifest.audiobook-manifest",
        )
        const manifestText = await manifestFile.text()
        const manifest = JSON.parse(manifestText) as ReadiumManifest

        await db
          .insertInto("position")
          .values({
            uuid: randomUUID(),
            bookUuid,
            locator: JSON.stringify({
              href: manifest.readingOrder[0]!.href,
              type: manifest.readingOrder[0]!.type,
              locations: {
                fragments: ["t=0"],
                progression: 0,
                totalProgression: 0,
              },
            }) as unknown as ReadiumLocator,
            timestamp: Date.now(),
          })
          .execute()
      }
    } else {
      logger.debug("Opening Readium publication")
      await openPublication(
        book.uuid,
        getLocalBookExtractedUrl(book.uuid, format),
        (await listenerApi
          .dispatch(
            localApi.endpoints.getBookOverlayClips.initiate(
              { bookUuid },
              { forceRefetch: true, subscribe: false },
            ),
          )
          .unwrap()) ?? undefined,
      )

      if (!book.position) {
        logger.debug("No local position for this book, starting at beginning")

        const positions = await listenerApi
          .dispatch(
            localApi.endpoints.getBookPositions.initiate(
              { bookUuid, format },
              { forceRefetch: true, subscribe: false },
            ),
          )
          .unwrap()

        await db
          .insertInto("position")
          .values({
            uuid: randomUUID(),
            bookUuid,
            locator: JSON.stringify(
              positions![0]!,
            ) as unknown as ReadiumLocator,
            timestamp: Date.now(),
          })
          .execute()
      }
    }

    if (
      format === "readaloud" &&
      !(await listenerApi
        .dispatch(
          localApi.endpoints.getBookOverlayClips.initiate(
            { bookUuid },
            { forceRefetch: false, subscribe: false },
          ),
        )
        .unwrap())
    ) {
      logger.debug("No clips parsed from media overlays, parsing")
      const clips = await Storyteller.getOverlayClips(bookUuid)
      logger.debug(`Parsed ${clips.length} clips from media overlay`)

      await db
        .updateTable("readaloud")
        .set({ clips: JSON.stringify(clips) as unknown as ReadiumClip[] })
        .where("bookUuid", "=", bookUuid)
        .execute()
    }

    listenerApi.throwIfCancelled()

    book = await listenerApi
      .dispatch(
        localApi.endpoints.getBook.initiate(
          { uuid: bookUuid },
          { subscribe: false },
        ),
      )
      .unwrap()

    if (!book) {
      logger.error(`Book not found: ${bookUuid}, queueing current tracks`)

      listenerApi.dispatch(
        bookshelfSlice.actions.playerQueued({ tracks: currentTracks }),
      )
      return
    }

    let tracks: StorytellerTrack[] = []
    if (format !== "ebook") {
      logger.debug(`Generating track listing for ${format}`)
      tracks = await generateTracks(book, format)
      logger.debug(`Generated ${tracks.length} tracks`)

      listenerApi.throwIfCancelled()

      const positions =
        format === "readaloud"
          ? await listenerApi
              .dispatch(
                localApi.endpoints.getBookPositions.initiate(
                  { bookUuid, format },
                  { forceRefetch: false, subscribe: false },
                ),
              )
              .unwrap()
          : null

      const clip =
        book.position &&
        (await getClip(book, format, book.position.locator, positions))

      listenerApi.throwIfCancelled()

      const bookPreferences = await listenerApi
        .dispatch(
          localApi.endpoints.getBookPreferences.initiate(
            { uuid: bookUuid },
            { subscribe: false },
          ),
        )
        .unwrap()

      listenerApi.throwIfCancelled()

      const playerSpeed = bookPreferences.audio?.speed ?? 1
      logger.debug(`Loading tracks into audio player`)
      await Storyteller.loadTracks(tracks)
      logger.debug(`Setting playback rate to ${playerSpeed}`)
      await Storyteller.setRate(playerSpeed)

      // Dispatch playerQueued before seekTo so that state.tracks contains the
      // new book's tracks when the native trackChanged event fires. Otherwise
      // audioTrackChanged picks up the old book's track (and its duration).
      listenerApi.dispatch(bookshelfSlice.actions.playerQueued({ tracks }))

      if (clip) {
        logger.debug(
          `Seeking to local position, ${clip.start}s at ${clip.relativeUrl}`,
        )
        await Storyteller.seekTo(clip.relativeUrl, clip.start, true)
      } else if (tracks[0]) {
        logger.debug(`No clip found, seeking to start of first track`)
        await Storyteller.seekTo(tracks[0].relativeUri, 0, true)
      }
      logger.debug("Audio queued")
    } else {
      listenerApi.dispatch(bookshelfSlice.actions.playerQueued({ tracks }))
    }

    logger.debug(`Book opened`)
  },
})
