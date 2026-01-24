import { File } from "expo-file-system"
import { documentDirectory, getContentUriAsync } from "expo-file-system/legacy"
import { Image } from "expo-image"
import { Platform } from "react-native"
import TrackPlayer, { PitchAlgorithm } from "react-native-track-player"

import { type BookWithRelations } from "@/database/books"
import { db } from "@/database/db"
import { getServer } from "@/database/servers"
import {
  type ReadiumManifest,
  getClip,
  openPublication,
} from "@/modules/readium"
import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
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
) {
  const server = book.serverUuid && (await getServer(book.serverUuid))
  const serverCoverUrl =
    server &&
    getCoverUrl(server.baseUrl, book.uuid, {
      height: 232,
      width: 232,
      audio: true,
    })
  if (serverCoverUrl) {
    await Image.prefetch(serverCoverUrl)
  }

  let coverUrl = book.audiobookCoverUrl
    ? new URL(book.audiobookCoverUrl, documentDirectory!).toString()
    : serverCoverUrl
      ? await Image.getCachePathAsync(serverCoverUrl)
      : null

  // Convert to content:// URI on Android for Android Auto compatibility
  if (coverUrl && Platform.OS === "android") {
    try {
      coverUrl = await getContentUriAsync(
        new URL(coverUrl, "file://").toString(),
      )
    } catch {
      // pass
    }
  }

  const manifest =
    format === "audiobook"
      ? book.audiobook?.manifest
      : book.readaloud?.audioManifest

  const audioLinks = manifest?.readingOrder ?? []

  return await Promise.all(
    audioLinks.map(async (audioLink) => {
      const uri = getLocalBookFileUrl(book.uuid, format, audioLink.href)

      return {
        bookUuid: book.uuid,
        title: audioLink.title ?? book.title,
        url: uri,
        duration: audioLink.duration!,
        album: book.title,
        artist: book.authors.map((author) => author.name).join(", "),
        ...(coverUrl && { artwork: coverUrl }),
        relativeUrl: encodeURI(audioLink.href),
        pitchAlgorithm: PitchAlgorithm.Voice,
        mimeType: audioLink.type.replace(/; codecs=.*/, ""),
      }
    }),
  )
}

startAppListening({
  actionCreator: bookshelfSlice.actions.bookOpened,
  effect: async (action, listenerApi) => {
    listenerApi.cancelActiveListeners()

    const { bookUuid, format } = action.payload

    const {
      currentlyPlayingBookUuid: previouslyPlayingBookUuid,
      currentlyPlayingFormat: previouslyPlayingFormat,
    } = listenerApi.getOriginalState().bookshelf

    if (
      previouslyPlayingBookUuid === bookUuid &&
      previouslyPlayingFormat === format
    ) {
      listenerApi.dispatch(bookshelfSlice.actions.playerQueued())
      return
    }

    listenerApi.throwIfCancelled()

    const book = await listenerApi
      .dispatch(localApi.endpoints.getBook.initiate({ uuid: bookUuid }))
      .unwrap()

    if (!book) {
      listenerApi.dispatch(bookshelfSlice.actions.playerQueued())
      return
    }

    listenerApi.throwIfCancelled()

    if (format === "audiobook") {
      if (!book.position) {
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
      await openPublication(
        book.uuid,
        getLocalBookExtractedUrl(book.uuid, format),
      )

      if (!book.position) {
        const positions = book[format]!.positions!

        await db
          .insertInto("position")
          .values({
            uuid: randomUUID(),
            bookUuid,
            locator: JSON.stringify(positions[0]!) as unknown as ReadiumLocator,
            timestamp: Date.now(),
          })
          .execute()
      }
    }

    listenerApi.throwIfCancelled()

    if (format !== "ebook") {
      const tracks = await generateTracks(book, format)

      listenerApi.throwIfCancelled()

      const clip =
        book.position && (await getClip(book, format, book.position.locator))

      listenerApi.throwIfCancelled()

      const bookPreferences = await listenerApi
        .dispatch(
          localApi.endpoints.getBookPreferences.initiate({ uuid: bookUuid }),
        )
        .unwrap()

      listenerApi.throwIfCancelled()

      const playerSpeed = bookPreferences.audio?.speed ?? 1
      await TrackPlayer.reset()
      await TrackPlayer.setRate(playerSpeed)
      await TrackPlayer.add(tracks)

      if (clip) {
        const trackIndex = tracks.findIndex(
          (track) => track.relativeUrl === clip.relativeUrl,
        )

        if (trackIndex !== -1) {
          await TrackPlayer.skip(trackIndex, clip.start)
        }
      }
    }

    listenerApi.dispatch(bookshelfSlice.actions.playerQueued())
  },
})
