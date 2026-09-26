import { File } from "expo-file-system"

import { db } from "@/database/db"
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
  firstClipInResource,
  isStandaloneAudiobookLocator,
  positionForProgression,
} from "@/store/locatorFormat"
import { getLocalBookExtractedUrl } from "@/store/persistence/files"
import { getPlaybackRateFromAudioPreferences } from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"
import { generateTracks } from "@/store/tracks"
import { randomUUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

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

    let clips: ReadiumClip[] = []

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

      const storedClips =
        format === "readaloud"
          ? await listenerApi
              .dispatch(
                localApi.endpoints.getBookOverlayClips.initiate(
                  { bookUuid },
                  { forceRefetch: true, subscribe: false },
                ),
              )
              .unwrap()
          : undefined

      await openPublication(
        book.uuid,
        getLocalBookExtractedUrl(book.uuid, format),
        // An empty clip list can mean the publication was cached while it was
        // parsed as another format, so passing undefined lets the native side parse the
        // overlays out of the publication on disk instead of trusting the cache.
        storedClips?.length ? storedClips : undefined,
      )

      if (format === "readaloud") {
        clips = await Storyteller.getOverlayClips(bookUuid)

        if (!storedClips?.length && clips.length) {
          logger.debug(`Parsed ${clips.length} clips from media overlay`)

          await db
            .updateTable("readaloud")
            .set({ clips: JSON.stringify(clips) as unknown as ReadiumClip[] })
            .where("bookUuid", "=", bookUuid)
            .execute()
        }
      }

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

    listenerApi.throwIfCancelled()

    let positions: ReadiumLocator[] | null = null
    if (format !== "audiobook") {
      positions = await listenerApi
        .dispatch(
          localApi.endpoints.getBookPositions.initiate(
            { bookUuid, format },
            { forceRefetch: false, subscribe: false },
          ),
        )
        .unwrap()
    }

    if (
      book.position &&
      positions &&
      isStandaloneAudiobookLocator(
        book.position.locator,
        book.audiobook?.manifest?.readingOrder.map((link) => link.href) ?? [],
      )
    ) {
      const remapped = positionForProgression(
        positions,
        book.position.locator.locations?.totalProgression,
      )

      if (remapped) {
        logger.debug(
          `Saved position ${book.position.locator.href} belongs to the standalone audiobook, remapping to ${remapped.href}`,
        )

        await listenerApi
          .dispatch(
            localApi.endpoints.updatePosition.initiate(
              {
                bookUuid,
                locator: remapped,
                timestamp: book.position.timestamp,
              },
              { track: false },
            ),
          )
          .unwrap()
      }
    }

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

      let clip: { relativeUrl: string; start: number } | null = null
      if (book.position) {
        try {
          clip = await getClip(book, format, book.position.locator, positions)
        } catch (e) {
          // A position that cannot be resolved must not keep the book from opening
          logger.debug(`Could not resolve a clip for the saved position`)
          logger.debug({ err: e })
        }

        // A remapped position names a resource but not a fragment within it, so
        // resume at the first sentence of wherever the reader was left.
        clip = clip ?? firstClipInResource(clips, book.position.locator.href)
      }

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

      const playerSpeed = getPlaybackRateFromAudioPreferences(
        bookPreferences.audio,
        listenerApi.getState().bookshelf.playbackSpeedContext,
      )
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
