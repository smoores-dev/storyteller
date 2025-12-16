import {
  HttpFetcher,
  Link,
  Locator,
  Manifest,
  Publication,
} from "@readium/shared"

import {
  type TocItem,
  getApiUrlFromResourceHref,
  getClip,
  getLocatorWithClosestPositionAsync,
  getTocItemsWithLocator,
  translateLocator,
  traverseToc,
} from "@/components/reader/BookService"
import type { BookWithRelations } from "@/database/books"
import { AudioPlayer, type AudioTrack } from "@/services/AudioPlayerService"
import { syncPosition } from "@/store/actions"
import { api, getCoverUrl } from "@/store/api"
import {
  type AudioTextMap,
  type TextAudioMap,
  registerAudioToTextMap,
  registerGuide,
  registerPositions,
  registerPublication,
  registerTextToAudioMap,
  registerTocItems,
} from "@/store/readerRegistry"
import {
  loadPerBookPreferencesFromStorage,
  preferencesSlice,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"
import { createCacheBustingFetch } from "@/utils/cacheBustingFetch"
import type { UUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

async function registerMaps(
  publication: Publication,
): Promise<{ textToAudioMap: TextAudioMap; audioToTextMap: AudioTextMap }> {
  const findAllGuides = await Promise.all(
    publication.readingOrder.items.map(async (item) => {
      const link = publication.linkWithHref(item.href)

      if (!link) return { link: null, clips: null }
      try {
        const guide = await publication.guideForLink(link)
        if (!guide)
          return {
            link,
            clips: null,
          }
        if (!guide.guided || guide.guided.length === 0) return null

        const clips = guide.guided
          .flatMap((guide) =>
            guide.children?.map((child) => {
              return {
                ...child.clip,
                type: item.type ?? "application/octet-stream",
              }
            }),
          )
          .filter((clip) => clip !== undefined)

        return {
          link,
          clips,
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("failed with HTTP status code 404")
        ) {
          return {
            link,
            clips: null,
          }
        }
        throw error
      }
    }),
  )

  const textToAudioMap = findAllGuides
    .filter(
      (guide) =>
        guide !== null && guide.clips != null && guide.clips.length > 0,
    )
    .reduce<TextAudioMap>((acc, guide) => {
      if (!guide) return acc
      let totalDuration = 0

      let textMap = acc.get(guide.link?.href ?? "")
      if (!textMap) {
        textMap = { totalDuration: 0, clips: new Map() }
        acc.set(guide.link?.href ?? "", textMap)
      }

      guide.clips?.forEach((clip) => {
        if (!clip.audioResource) return

        let clipMap = textMap.clips.get(clip.audioResource)
        const clipEnd = clip.end ?? 0
        const clipStart = clip.start ?? 0
        const clipDuration = clipEnd > clipStart ? clipEnd - clipStart : 0
        totalDuration += clipDuration
        if (!clipMap) {
          clipMap = {
            href: clip.audioResource,
            duration: clipDuration,
            start: clipStart,
            end: clipEnd,
            type: clip.type,
          }
          textMap.clips.set(clip.audioResource, clipMap)
          return
        }

        clipMap.duration += clipDuration
        if (clipMap.end < clipEnd) {
          clipMap.end = clipEnd
        }
        if (clipMap.start > clipStart) {
          clipMap.start = clipStart
        }
      })

      textMap.totalDuration = totalDuration

      return acc
    }, new Map())

  const audioToTextMap = new Map() as AudioTextMap

  // collect all segments for each audio file from the original guide clips
  // we need to go back to the original clips to get the time information
  const audioSegments = new Map<
    string,
    Array<{ startTime: number; endTime: number; textHref: string }>
  >()

  for (const guideData of findAllGuides) {
    if (
      !guideData ||
      !guideData.link ||
      guideData.clips === null ||
      guideData.clips.length === 0
    )
      continue

    const textHref = guideData.link.href

    for (const clip of guideData.clips) {
      if (!clip.audioResource) continue

      const clipStart = clip.start ?? 0
      const clipEnd = clip.end ?? 0

      const existingSegments = audioSegments.get(clip.audioResource)
      if (!existingSegments) {
        audioSegments.set(clip.audioResource, [])
      }

      const segments = audioSegments.get(clip.audioResource)
      if (segments) {
        segments.push({
          startTime: clipStart,
          endTime: clipEnd,
          textHref,
        })
      }
    }
  }

  for (const [audioHref, segments] of audioSegments) {
    // sort segments by start time
    segments.sort((a, b) => a.startTime - b.startTime)

    const duration = segments.reduce(
      (sum, seg) => sum + (seg.endTime - seg.startTime),
      0,
    )
    const start = Math.min(...segments.map((s) => s.startTime))
    const end = Math.max(...segments.map((s) => s.endTime))

    const type =
      textToAudioMap.get(segments[0]?.textHref ?? "")?.clips.get(audioHref)
        ?.type ?? "application/octet-stream"

    audioToTextMap.set(audioHref, {
      duration,
      start,
      end,
      segments,
      type,
    })
  }

  registerTextToAudioMap(textToAudioMap)
  registerAudioToTextMap(audioToTextMap)
  return { textToAudioMap, audioToTextMap }
}

export class PublicationLoadError extends Error {
  errorType: string

  constructor(message: string, errorType: string) {
    super(message)
    this.name = "PublicationLoadError"
    this.errorType = errorType
  }
}

async function loadPublication(
  book: BookWithRelations,
  mode: "epub" | "audiobook" | "readaloud",
) {
  const currentUrl = new URL(window.location.href)
  const r = mode === "audiobook" ? "listen" : "read"

  const publicationUrl = new URL(
    `/api/v2/books/${book.uuid}/${r}/manifest.json`,
    currentUrl.origin,
  )

  const fetcher = new HttpFetcher(
    createCacheBustingFetch({ book: book }),
    publicationUrl.toString(),
  )

  const manifestLink = new Link({ href: "manifest.json" })

  try {
    const fetched = fetcher.get(manifestLink)
    const selfLink = (await fetched.link()).toURL(publicationUrl.toString())
    if (!selfLink) {
      throw new PublicationLoadError(
        "Failed to get self link",
        "internal_error",
      )
    }
    const response = await fetched.readAsJSON()
    const manifest = Manifest.deserialize(response as string)
    if (!manifest) {
      throw new PublicationLoadError(
        "Failed to deserialize manifest",
        "internal_error",
      )
    }

    manifest.setSelfLink(selfLink)

    const publication = new Publication({
      manifest: manifest,
      fetcher: fetcher,
    })

    const positions = await publication.positionsFromManifest()
    const tocItems = getTocItemsWithLocator(publication, positions)

    return { publication, positions, tocItems }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("failed with HTTP status code 404")
    ) {
      const errorBody = (await fetch(publicationUrl.toString(), {
        cache: "no-cache",
      }).then((res) => res.json().catch(() => null))) as {
        error?: string
        message?: string
      } | null

      if (errorBody?.error) {
        throw new PublicationLoadError(
          errorBody.message ?? "Failed to load book",
          errorBody.error,
        )
      }

      throw new PublicationLoadError("Book file not found", "book_not_found")
    }
    throw error
  }
}

function generateTracksForAudiobook(
  publication: Publication,
  bookUuid: UUID,
  bookTitle: string,
  authors: string,
): AudioTrack[] {
  return publication.readingOrder.items.map((item, idx) => {
    return {
      id: item.href,

      src: getApiUrlFromResourceHref(bookUuid, item.href, "listen"),
      url: getApiUrlFromResourceHref(bookUuid, item.href, "listen"),
      relativeUrl: item.href,
      title: item.title ?? `Track ${idx + 1}`,
      artist: authors,
      album: bookTitle,
      duration: item.duration ?? 0,
      type: item.type ?? "application/octet-stream",
      start: item.properties?.otherProperties["start"] ?? 0,
      end: item.properties?.otherProperties["end"] ?? item.duration ?? 0,
    } satisfies AudioTrack
  })
}

async function generateTracksForReadaloud(
  publication: Publication,
  bookUuid: UUID,
  bookTitle: string,
  authors: string,
): Promise<AudioTrack[]> {
  const { textToAudioMap, audioToTextMap } = await registerMaps(publication)

  const audioHrefToChapterTitle = new Map<
    string,
    { title: string; tocItem: TocItem }
  >()

  traverseToc(publication.toc?.items ?? [], (item, level) => {
    if (!item.title) {
      return
    }

    let z = textToAudioMap.get(item.href)
    if (!z?.clips) {
      // try without the #
      z = textToAudioMap.get(item.href.split("#")[0] ?? "")
      if (!z?.clips) {
        return
      }
    }

    const entries = Array.from(z.clips.entries())
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry) {
        continue
      }

      const [audioHref] = entry
      const title =
        z.clips.size > 1
          ? `${item.title} [${i + 1}/${z.clips.size}]`
          : item.title

      const existingEntry = audioHrefToChapterTitle.get(audioHref)
      if (existingEntry) {
        continue
      }

      audioHrefToChapterTitle.set(audioHref, {
        title,
        tocItem: {
          id: "xxxxx",
          level,
          ...(item.serialize() as Omit<TocItem, "id" | "level">),
        },
      })
    }
  })

  // map over audioToTextMap bc it's more likely to be in the correct order
  // it's at the very least in readaloud order, which the resources are not guaranteed to be
  const tracks = audioToTextMap
    .entries()
    .map(([track, additionalInfo], idx) => {
      const toc = audioHrefToChapterTitle.get(track)
      // const metadataForClip = metadata[track.href]
      const clipUrl = getApiUrlFromResourceHref(bookUuid, track)

      return {
        id: track,
        src: clipUrl,
        url: clipUrl,
        href: track,
        tocItem: toc?.tocItem,
        album: bookTitle,
        artwork: new URL(
          getCoverUrl(bookUuid, {
            audio: true,
            height: 64,
            width: 64,
          }),
          window.location.origin,
        ).toString(),
        audioResource: track,
        relativeUrl: track,
        artist: authors || "Unknown Artist",
        title: toc?.title ?? toc?.tocItem.title ?? `Track ${idx + 1}`,
        duration: additionalInfo.duration,
        type: additionalInfo.type,
      } satisfies AudioTrack
    })
    .toArray()

  return tracks
}

startAppListening({
  actionCreator: readingSessionSlice.actions.startBook,
  effect: async (action, listenerApi) => {
    listenerApi.unsubscribe()

    const { book } = action.payload
    const mode = selectReadingMode(listenerApi.getState())

    try {
      const { publication, positions, tocItems } = await loadPublication(
        book,
        mode,
      )

      const preferences = loadPerBookPreferencesFromStorage(book.uuid) ?? {}
      listenerApi.dispatch(
        preferencesSlice.actions.initBookPreferences({
          preferences,
          bookId: book.uuid,
        }),
      )

      registerPublication(publication)
      registerPositions(positions)
      registerTocItems(tocItems)
      listenerApi.dispatch(
        readingSessionSlice.actions.setPublicationLoading(false),
      )

      if (mode === "audiobook" || mode === "readaloud") {
        const authors = book.authors.map((a) => a.name).join(", ")

        const tracks =
          mode === "audiobook"
            ? generateTracksForAudiobook(
                publication,
                book.uuid,
                book.title,
                authors,
              )
            : await generateTracksForReadaloud(
                publication,
                book.uuid,
                book.title,
                authors,
              )

        if (tracks.length === 0) {
          console.error("No audio tracks found")
          return
        }

        const savedPosition = await listenerApi
          .dispatch(api.endpoints.getPosition.initiate({ uuid: book.uuid }))
          .unwrap()
          .catch((error: unknown) => {
            console.error("Failed to get saved position:", error)
            return null
          })

        const playbackSpeed = selectPreference(
          listenerApi.getState(),
          "playbackSpeed",
        )
        const volume = selectPreference(listenerApi.getState(), "volume")

        if (mode === "audiobook") {
          const savedLocator = savedPosition
            ? Locator.deserialize(savedPosition.locator)
            : null
          if (!savedLocator) {
            await initializeAudioPlayer({
              tracks,
              startTrackIndex: 0,
              startPosition: 0,
              playbackSpeed,
              volume,
            })
            return
          }

          // possibly translate between audio and text locators
          const translatedLocator = translateLocator(savedLocator, mode)

          const currentTrackIndex = tracks.findIndex(
            (track) =>
              track.url ===
              getApiUrlFromResourceHref(
                book.uuid,
                translatedLocator.href,
                "listen",
              ),
          )

          const savedTime =
            translatedLocator.locations.fragments[0]?.split("=")[1]
          const position = savedTime ? parseFloat(savedTime) : 0

          await initializeAudioPlayer({
            tracks,
            startTrackIndex: currentTrackIndex !== -1 ? currentTrackIndex : 0,
            startPosition: !Number.isNaN(position) ? position : 0,
            playbackSpeed,
            volume,
          })
        }
        // readaloud or epub
        else {
          const locator = savedPosition?.locator
            ? Locator.deserialize(savedPosition.locator) || null
            : null

          const translatedLocator = locator
            ? translateLocator(locator, mode)
            : null

          const correctLocator = await getLocatorWithClosestPositionAsync(
            translatedLocator,
            positions,
          )

          const link = correctLocator
            ? publication.readingOrder.findWithHref(correctLocator.href)
            : null

          if (!link || !correctLocator) {
            console.error("No link found, starting at beginning")
            await initializeAudioPlayer({
              tracks,
              startTrackIndex: 0,
              startPosition: 0,
              playbackSpeed,
              volume,
            })
            return
          }

          const guide = await publication.guideForLink(link)

          listenerApi.dispatch(
            syncPosition({
              locator: correctLocator,
              timestamp: Date.now(),
              bookUuid: book.uuid,
              noServer: true,
            }),
          )

          if (!guide) {
            console.error("No guide found, starting at beginning")
            await initializeAudioPlayer({
              tracks,
              startTrackIndex: 0,
              startPosition: 0,
              playbackSpeed,
              volume,
            })
            return
          }

          registerGuide(guide)

          const clip = getClip(guide, correctLocator)

          if (!clip) {
            console.error("No clip found, starting at beginning")
            await initializeAudioPlayer({
              tracks,
              startTrackIndex: 0,
              startPosition: 0,
              playbackSpeed,
              volume,
            })
            return
          }

          const clipIndex = tracks.findIndex(
            (c) => c["audioResource"] === clip.audioResource,
          )

          if (clipIndex === -1) {
            console.error("Track not found for clip, starting at beginning")
            await initializeAudioPlayer({
              tracks,
              startTrackIndex: 0,
              startPosition: 0,
              playbackSpeed,
              volume,
            })
            return
          }

          await initializeAudioPlayer({
            tracks,
            startTrackIndex: clipIndex,
            startPosition: clip.start,
            playbackSpeed,
            volume,
          })
        }
      }

      // eslint-disable-next-line no-console
    } catch (error) {
      if (error instanceof Error && error.message.includes("cancelled")) {
        // eslint-disable-next-line no-console
        console.log("Book opening cancelled (user opened another book)")
      } else if (error instanceof PublicationLoadError) {
        console.error("Failed to load book:", error)
        const errorType = [
          "book_not_found",
          "resource_not_found",
          "service_unavailable",
          "internal_error",
        ].includes(error.errorType)
          ? (error.errorType as
              | "book_not_found"
              | "resource_not_found"
              | "service_unavailable"
              | "internal_error")
          : "internal_error"
        listenerApi.dispatch(
          readingSessionSlice.actions.setReaderError({
            error: errorType,
            message: error.message,
          }),
        )
      } else {
        console.error("Failed to open book:", error)
        listenerApi.dispatch(
          readingSessionSlice.actions.setReaderError({
            error: "internal_error",
            message:
              error instanceof Error
                ? error.message
                : "An unexpected error occurred",
          }),
        )
      }
    } finally {
      listenerApi.subscribe()
      listenerApi.dispatch(
        readingSessionSlice.actions.setPublicationLoading(false),
      )
    }
  },
})

async function initializeAudioPlayer({
  tracks,
  startTrackIndex,
  startPosition,
  playbackSpeed,
  volume,
}: {
  tracks: AudioTrack[]
  startTrackIndex: number
  startPosition: number
  playbackSpeed: number
  volume: number
}) {
  await AudioPlayer.replacePlaylist(tracks, startTrackIndex, startPosition)
  AudioPlayer.setPlaybackRate(playbackSpeed)
  AudioPlayer.setVolume(volume)
}
