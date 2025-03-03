import {
  select,
  takeEvery,
  put,
  call,
  takeLatest,
  ActionPattern,
  actionChannel,
  flush,
  fork,
  take,
} from "redux-saga/effects"
import { ActionMatchingPattern } from "@redux-saga/types"
import {
  getLocalBookArchiveUrl,
  getBooksDirectoryUrl,
  getBookArchivesDirectoryUrl,
  getLocalBookExtractedUrl,
  ensureCoversDirectory,
  getLocalBookCoverUrl,
  getLocalAudioBookCoverUrl,
  getLocalBookFileUrl,
  deleteLocalBookFiles,
  getOldLocalBookCoverUrl,
  getOldLocalAudioBookCoverUrl,
  getBookCoversDirectoryUrl,
  getAudioBookCoversDirectoryUrl,
} from "../persistence/files"
import { getApiClient } from "../selectors/apiSelectors"
import { getLibraryBook } from "../selectors/librarySelectors"
import {
  BookshelfTrack,
  BookshelfBook,
  bookshelfSlice,
  playerPositionUpdated,
  playerPaused,
  localBookImported,
  playerPositionSeeked,
  playerTotalPositionSeeked,
  playerTrackChanged,
  nextTrackPressed,
  prevTrackPressed,
} from "../slices/bookshelfSlice"
import { librarySlice } from "../slices/librarySlice"
import * as FileSystem from "expo-file-system"
import { Audio } from "expo-av"
import {
  deleteBook,
  deleteBookmark,
  deleteHighlight,
  readBookIds,
  readBookmarks,
  readHighlights,
  readLocators,
  writeBook,
  writeBookmark,
  writeHighlight,
  writeLocator,
} from "../persistence/books"
import TrackPlayer, {
  AddTrack,
  PitchAlgorithm,
} from "react-native-track-player"
import {
  getBookshelfBook,
  getBookshelfBookIds,
  getCurrentlyPlayingBook,
  getLocator,
} from "../selectors/bookshelfSelectors"
import { router } from "expo-router"
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake"
import {
  END,
  EventChannel,
  FlushableChannel,
  TakeableChannel,
  buffers,
  eventChannel,
} from "redux-saga"
import { logger } from "../../logger"
import {
  extractArchive,
  getClip,
  getFragment,
  getPositions,
  getResource,
  locateLink,
  openPublication,
} from "../../modules/readium"
import {
  ReadiumContributor,
  ReadiumLocalizedString,
  TimestampedLocator,
} from "../../modules/readium/src/Readium.types"
import { BookAuthor } from "../../apiModels"
import { preferencesSlice } from "../slices/preferencesSlice"
import { getBookPlayerSpeed } from "../selectors/preferencesSelectors"
import { ApiClientError } from "../../apiClient"

export function createDownloadChannel(
  pauseState: FileSystem.DownloadPauseState,
) {
  let download: FileSystem.DownloadResumable

  const buf = buffers.sliding<{ progress: number }>(1)
  const progressChannel = eventChannel<{ progress: number }>((emit) => {
    download = FileSystem.createDownloadResumable(
      pauseState.url,
      pauseState.fileUri,
      pauseState.options,
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const progress = totalBytesWritten / totalBytesExpectedToWrite
        emit({ progress })
      },
      pauseState.resumeData,
    )

    download.downloadAsync().then(() => emit(END))

    return () => {
      download.cancelAsync()
    }
  }, buf)

  // @ts-expect-error `download` is actually assigned here; eventChannel is synchronous
  return { progressChannel, download }
}

export function* runDownload(
  bookId: number,
  progressChannel: EventChannel<{ progress: number }>,
  download: FileSystem.DownloadResumable,
) {
  try {
    while (true) {
      const { progress } = (yield take(progressChannel)) as {
        progress: number
      }

      yield put(
        librarySlice.actions.bookDownloadProgressUpdated({ bookId, progress }),
      )
    }
  } catch (error) {
    logger.error(error)
  } finally {
    logger.info(`Finished downloading to ${download.fileUri}`)
  }
}

function* downloadBookArchive(bookId: number) {
  const apiClient = (yield select(getApiClient)) as ReturnType<
    typeof getApiClient
  >

  if (!apiClient?.isAuthenticated()) return
  const localBookArchiveUrl = getLocalBookArchiveUrl(bookId)
  const downloadUrl = apiClient.getSyncedDownloadUrl(bookId)

  const archiveInfo = (yield call(
    FileSystem.getInfoAsync,
    localBookArchiveUrl,
  )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

  if (archiveInfo.exists) {
    logger.info(`Archive file already exists. Deleting.`)
    yield call(FileSystem.deleteAsync, archiveInfo.uri)
  }

  logger.info(`Downloading archive file: '${downloadUrl}'`)

  const parentDirInfo = (yield call(
    FileSystem.getInfoAsync,
    getBooksDirectoryUrl(),
  )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

  if (!parentDirInfo.exists) {
    yield call(FileSystem.makeDirectoryAsync, getBooksDirectoryUrl())
  }

  const archiveDirInfo = (yield call(
    FileSystem.getInfoAsync,
    getBookArchivesDirectoryUrl(),
  )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

  if (!archiveDirInfo.exists) {
    yield call(FileSystem.makeDirectoryAsync, getBookArchivesDirectoryUrl())
  }

  const { progressChannel, download } = createDownloadChannel({
    url: downloadUrl,
    fileUri: localBookArchiveUrl,
    options: { headers: apiClient.getHeaders() },
  })

  yield call(runDownload, bookId, progressChannel, download)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Generated<T extends Generator<any, any, any>> =
  T extends Generator<any, infer R, any> ? R : never
/* eslint-enable @typescript-eslint/no-explicit-any */

export function* extractBookArchive(bookId: number) {
  const localBookExtractedUrl = getLocalBookExtractedUrl(bookId)
  const extractedInfo = (yield call(
    FileSystem.getInfoAsync,
    localBookExtractedUrl,
  )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

  if (extractedInfo.exists) {
    logger.info(`Archive already extracted. Removing.`)
    yield call(FileSystem.deleteAsync, localBookExtractedUrl)
  }

  logger.info(`Extracting EPUB archive to ${localBookExtractedUrl}`)

  yield call(FileSystem.makeDirectoryAsync, localBookExtractedUrl, {
    intermediates: true,
  })

  const localBookArchiveUrl = getLocalBookArchiveUrl(bookId)

  yield call(extractArchive, localBookArchiveUrl, localBookExtractedUrl)

  // Clear up some space by deleting the archive once it's been
  // extracted
  yield call(FileSystem.deleteAsync, localBookArchiveUrl)

  return localBookExtractedUrl
}

export function* downloadBookCovers(bookId: number) {
  yield call(ensureCoversDirectory)

  const coverDownloadUrl = getLocalBookCoverUrl(bookId)
  const audioCoverDownloadUrl = getLocalAudioBookCoverUrl(bookId)

  const apiClient = (yield select(getApiClient)) as ReturnType<
    typeof getApiClient
  >

  if (!apiClient?.isAuthenticated()) return

  const { status } = (yield call(
    FileSystem.downloadAsync,
    apiClient.getCoverUrl(bookId, true),
    audioCoverDownloadUrl,
    {
      headers: apiClient.getHeaders(),
    },
  )) as Awaited<ReturnType<typeof FileSystem.downloadAsync>>

  if (status !== 200) {
    yield call(
      FileSystem.downloadAsync,
      apiClient.getCoverUrl(bookId),
      audioCoverDownloadUrl,
      {
        headers: apiClient.getHeaders(),
      },
    )
  }

  yield call(
    FileSystem.downloadAsync,
    apiClient.getCoverUrl(bookId),
    coverDownloadUrl,
    {
      headers: apiClient.getHeaders(),
    },
  )
}

function* generateTracks(book: BookshelfBook) {
  const coverUrl = getLocalAudioBookCoverUrl(book.id)

  // TODO - Ensure that these are ordered by reading order,
  // and get durations from metadata
  const audioLinks =
    book.manifest.resources
      ?.filter((link) => link.type.startsWith("audio"))
      .sort((a, b) => {
        if (a.href < b.href) {
          return -1
        } else if (a.href > b.href) {
          return 1
        } else {
          return 0
        }
      }) ?? []

  const tracks: BookshelfTrack[] = []
  for (const audioLink of audioLinks) {
    const uri = getLocalBookFileUrl(book.id, audioLink.href.slice(1))
    const sound = new Audio.Sound()
    const track = (yield call([sound, sound.loadAsync], { uri })) as Awaited<
      ReturnType<(typeof sound)["loadAsync"]>
    >
    const duration =
      track.isLoaded && track.durationMillis
        ? track.durationMillis / 1000
        : undefined

    yield call([sound, sound.unloadAsync])

    tracks.push({
      bookId: book.id,
      title: book.title,
      url: uri,
      duration,
      album: audioLink.title ?? book.title,
      artist: book.authors.map((author) => author.name).join(", "),
      artwork: coverUrl,
      relativeUrl: encodeURI(audioLink.href),
      pitchAlgorithm: PitchAlgorithm.Voice,
    })
  }

  return tracks
}

export function* downloadBookSaga() {
  yield takeEvery(
    [librarySlice.actions.bookDownloadPressed, localBookImported],
    function* (action) {
      const { bookId } = action.payload
      if (action.type === librarySlice.actions.bookDownloadPressed.type) {
        yield call(activateKeepAwakeAsync, `download/${bookId}`)

        const libraryBook = (yield select(
          getLibraryBook,
          bookId,
        )) as ReturnType<typeof getLibraryBook>

        if (!libraryBook) return

        yield call(downloadBookArchive, bookId)
        yield call(downloadBookCovers, bookId)
      } else {
        const localBookArchiveDirUrl = getBookArchivesDirectoryUrl()

        const archiveInfo = (yield call(
          FileSystem.getInfoAsync,
          localBookArchiveDirUrl,
        )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

        if (!archiveInfo.exists) {
          yield call(FileSystem.makeDirectoryAsync, localBookArchiveDirUrl, {
            intermediates: true,
          })
        }

        yield call(FileSystem.copyAsync, {
          from: action.payload.archiveUrl,
          to: getLocalBookArchiveUrl(bookId),
        })
      }

      const extractedPath = (yield call(
        extractBookArchive,
        bookId,
      )) as Generated<ReturnType<typeof extractBookArchive>>

      yield call(writeBook, bookId)

      const manifest = (yield call(
        openPublication,
        bookId,
        extractedPath,
      )) as Awaited<ReturnType<typeof openPublication>>

      const positions = (yield call(getPositions, bookId)) as Awaited<
        ReturnType<typeof getPositions>
      >

      if (action.type === localBookImported.type) {
        const coverLink = manifest.resources?.find((resource) =>
          resource.rel?.includes("cover"),
        )
        if (coverLink) {
          const bookCoversDirectoryUrl = getBookCoversDirectoryUrl()

          const coversDirectoryInfo = (yield call(
            FileSystem.getInfoAsync,
            bookCoversDirectoryUrl,
          )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

          if (!coversDirectoryInfo.exists) {
            yield call(FileSystem.makeDirectoryAsync, bookCoversDirectoryUrl, {
              intermediates: true,
            })
          }

          const audioCoversDirectoryUrl = getAudioBookCoversDirectoryUrl()

          const audioCoversDirectoryInfo = (yield call(
            FileSystem.getInfoAsync,
            audioCoversDirectoryUrl,
          )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

          if (!audioCoversDirectoryInfo.exists) {
            yield call(FileSystem.makeDirectoryAsync, audioCoversDirectoryUrl, {
              intermediates: true,
            })
          }

          const coverString = (yield call(
            getResource,
            bookId,
            coverLink,
          )) as Awaited<ReturnType<typeof getResource>>

          yield call(
            FileSystem.writeAsStringAsync,
            getLocalBookCoverUrl(bookId),
            coverString,
            { encoding: FileSystem.EncodingType.Base64 },
          )

          yield call(
            FileSystem.writeAsStringAsync,
            getLocalAudioBookCoverUrl(bookId),
            coverString,
            { encoding: FileSystem.EncodingType.Base64 },
          )
        }
      }

      const apiClient = (yield select(getApiClient)) as ReturnType<
        typeof getApiClient
      >

      let timestampedLocator: TimestampedLocator | null = null
      if (apiClient?.isAuthenticated()) {
        try {
          timestampedLocator = (yield call(
            [apiClient, apiClient.getSyncedPosition],
            bookId,
          )) as Awaited<ReturnType<typeof apiClient.getSyncedPosition>>
        } catch {
          //
        }
      }
      if (!timestampedLocator) {
        const firstLink = manifest.readingOrder[0]

        if (!firstLink)
          throw new Error(
            `Failed to parse book ${parseLocalizedString(
              manifest.metadata.title,
            )}: No reading order found`,
          )

        const firstLocator = (yield call(
          locateLink,
          bookId,
          firstLink,
        )) as Awaited<ReturnType<typeof locateLink>>

        timestampedLocator = {
          locator: firstLocator,
          timestamp: Date.now(),
        }
      }

      yield call(writeLocator, bookId, timestampedLocator)

      yield put(
        bookshelfSlice.actions.bookDownloadCompleted({
          book: {
            id: bookId,
            title: parseLocalizedString(manifest.metadata.title),
            authors: readiumToStorytellerAuthors(manifest.metadata.author),
            manifest,
            positions,
            highlights: [],
            bookmarks: [],
          },
          locator: timestampedLocator,
        }),
      )
    },
  )
}

export function* deactivateKeepAwakeSaga() {
  yield takeEvery(
    bookshelfSlice.actions.bookDownloadCompleted,
    function* (action) {
      const { book } = action.payload

      yield call(deactivateKeepAwake, `download/${book.id}`)
    },
  )
}

export function parseLocalizedString(
  localizedString: ReadiumLocalizedString,
  locale = "en-US",
): string {
  if (typeof localizedString === "string") {
    return localizedString
  }

  if (locale in localizedString) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return localizedString[locale]!
  }

  const firstLocale =
    // Localized strings all have at least one locale
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    Object.keys(localizedString)[0]!

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return localizedString[firstLocale]!
}

export function readiumToStorytellerAuthors(
  author: ReadiumContributor[] | ReadiumContributor | undefined,
) {
  if (!author) return []

  const authors = Array.isArray(author) ? author : [author]

  return authors.map<BookAuthor>((a) => {
    if (typeof a === "string") {
      return {
        name: parseLocalizedString(a),
        file_as: a,
        role: null,
      }
    }
    return {
      name: parseLocalizedString(a.name),
      file_as: a.sortAs ?? parseLocalizedString(a.name),
      role: Array.isArray(a.role) ? a.role.join(", ") : a.role ?? null,
    }
  })
}

export function* hydrateBookshelf() {
  const bookIds = (yield call(readBookIds)) as Awaited<
    ReturnType<typeof readBookIds>
  >

  if (!bookIds) {
    yield put(
      bookshelfSlice.actions.bookshelfHydrated({
        books: [],
        locators: {},
      }),
    )
    return
  }

  const books: BookshelfBook[] = []
  for (const bookId of bookIds) {
    const extractedPath = getLocalBookExtractedUrl(bookId)
    const manifest = (yield call(
      openPublication,
      bookId,
      extractedPath,
    )) as Awaited<ReturnType<typeof openPublication>>

    const positions = (yield call(getPositions, bookId)) as Awaited<
      ReturnType<typeof getPositions>
    >

    const oldCoverInfo = (yield call(
      FileSystem.getInfoAsync,
      getOldLocalBookCoverUrl(bookId),
    )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

    if (oldCoverInfo.exists) {
      yield call(FileSystem.moveAsync, {
        from: getOldLocalBookCoverUrl(bookId),
        to: getLocalBookCoverUrl(bookId),
      })
    }

    const oldAudioCoverInfo = (yield call(
      FileSystem.getInfoAsync,
      getOldLocalAudioBookCoverUrl(bookId),
    )) as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>

    if (oldAudioCoverInfo.exists) {
      yield call(FileSystem.moveAsync, {
        from: getOldLocalAudioBookCoverUrl(bookId),
        to: getLocalAudioBookCoverUrl(bookId),
      })
    }

    const bookmarks = (yield call(readBookmarks, bookId)) as Awaited<
      ReturnType<typeof readBookmarks>
    >

    const highlights = (yield call(readHighlights, bookId)) as Awaited<
      ReturnType<typeof readHighlights>
    >

    books.push({
      id: bookId,
      title: parseLocalizedString(manifest.metadata.title),
      authors: readiumToStorytellerAuthors(manifest.metadata.author),
      manifest,
      positions,
      highlights,
      bookmarks,
    })
  }

  const locators = (yield call(readLocators, books)) as Awaited<
    ReturnType<typeof readLocators>
  >

  yield put(
    bookshelfSlice.actions.bookshelfHydrated({ books: books, locators }),
  )
}

/**
 * Sort of a hybrid between takeLatest and takeLeading.
 *
 * Works like takeLeading, except that it queues actions while it's
 * running. If there are any queued actions after it finishes, it
 * runs on the most recent of those, again queueing while running.
 */
function takeLeadingWithQueue<P extends ActionPattern>(
  pattern: P,
  worker: (action: ActionMatchingPattern<P>) => unknown,
) {
  return fork(function* () {
    const channel = (yield actionChannel(pattern)) as FlushableChannel<
      ActionMatchingPattern<P>
    > &
      TakeableChannel<ActionMatchingPattern<P>>

    while (true) {
      const actions = (yield flush(channel)) as Array<ActionMatchingPattern<P>>
      const action = actions.at(-1)
      if (action !== undefined) {
        yield call(worker, action)
      } else {
        yield take(pattern)
      }
    }
  })
}

/**
 * On a set interval, scan through local books and attempt to
 * sync their positions to the backend API.
 *
 * If we encounter a conflict, indicating that there's a newer position
 * from another client for a given book, we pull that newer position and
 * update our local state.
 */
export function* syncPositionsSaga() {
  const apiClient = (yield select(getApiClient)) as ReturnType<
    typeof getApiClient
  >

  if (!apiClient?.isAuthenticated()) return

  const pollChannel = eventChannel((emit) => {
    const interval = setInterval(() => {
      emit(true)
    }, 10000)
    // Run this in a new macro task so that it doesn't
    // emit before we start listening in the takeEvery
    // call
    setImmediate(() => emit(true))
    return () => clearInterval(interval)
  })

  yield takeEvery(pollChannel, function* () {
    const bookIds = (yield select(getBookshelfBookIds)) as ReturnType<
      typeof getBookshelfBookIds
    >
    for (const bookId of bookIds) {
      const timestampedLocator = (yield select(
        getLocator,
        bookId,
      )) as ReturnType<typeof getLocator>
      if (!timestampedLocator) continue
      const { timestamp, locator } = timestampedLocator
      try {
        yield call(
          [apiClient, apiClient.syncPosition],
          bookId,
          locator,
          timestamp,
        )
      } catch (e) {
        if (e instanceof ApiClientError && e.statusCode === 409) {
          try {
            const newPosition = (yield call(
              [apiClient, apiClient.getSyncedPosition],
              bookId,
            )) as Awaited<ReturnType<typeof apiClient.getSyncedPosition>>

            yield put(
              bookshelfSlice.actions.bookPositionSynced({
                bookId,
                locator: newPosition,
              }),
            )
          } catch {
            // Ignore any errors here; we'll retry in ten seconds anyway
          }
        }
      }
    }
  })
}

export function* persistLocatorSaga() {
  yield takeLeadingWithQueue(
    [
      bookshelfSlice.actions.bookRelocated,
      bookshelfSlice.actions.bookPositionSynced,
      bookshelfSlice.actions.navItemTapped,
      bookshelfSlice.actions.playerPositionUpdateCompleted,
      bookshelfSlice.actions.bookDownloadCompleted,
    ],
    function* (action) {
      const { locator } = action.payload
      const bookId =
        action.type === bookshelfSlice.actions.bookDownloadCompleted.type
          ? action.payload.book.id
          : action.payload.bookId

      yield call(writeLocator, bookId, locator)
    },
  )
}

function* getCurrentClip(book: BookshelfBook) {
  const timestampedLocator = (yield select(getLocator, book.id)) as ReturnType<
    typeof getLocator
  >

  if (!timestampedLocator) {
    logger.error(
      `Could not convert locator to position for book ${book.id}: no locator found in state.`,
    )
    return
  }

  const { locator } = timestampedLocator

  const clip = (yield call(getClip, book.id, locator)) as Awaited<
    ReturnType<typeof getClip>
  >
  return clip
}

export function* ensureTrackPlaySaga() {
  yield takeEvery(bookshelfSlice.actions.bookDoubleTapped, function* () {
    yield call(TrackPlayer.play)
  })
}

export function* loadTrackPlayerSaga() {
  yield takeLatest(
    [
      bookshelfSlice.actions.bookOpenPressed,
      bookshelfSlice.actions.playerOpenPressed,
    ],
    function* (action) {
      const { bookId } = action.payload
      if (action.type === bookshelfSlice.actions.bookOpenPressed.type) {
        yield call([router, router.push], {
          pathname: "/book/[id]",
          params: { id: bookId },
        })
      }
      if (action.type === bookshelfSlice.actions.playerOpenPressed.type) {
        yield call([router, router.push], "/player")
      }
      const currentTracks = (yield call(
        TrackPlayer.getQueue,
      )) as BookshelfTrack[]
      if (currentTracks[0]?.bookId === bookId) {
        yield put(bookshelfSlice.actions.playerQueued())
        return
      }

      const book = (yield select(getBookshelfBook, bookId)) as ReturnType<
        typeof getBookshelfBook
      >

      if (!book) {
        yield put(bookshelfSlice.actions.playerQueued())
        return
      }

      const tracks = (yield call(generateTracks, book)) as Generated<
        ReturnType<typeof generateTracks>
      >

      const clip = (yield call(getCurrentClip, book)) as Generated<
        ReturnType<typeof getCurrentClip>
      >

      const playerSpeed = (yield select(
        getBookPlayerSpeed,
        bookId,
      )) as ReturnType<typeof getBookPlayerSpeed>

      yield call(TrackPlayer.reset)
      yield call(TrackPlayer.setRate, playerSpeed)
      // @ts-expect-error Not sure what's up here, but this is the correct type
      yield call(TrackPlayer.add, tracks as AddTrack[])

      if (clip) {
        const trackIndex = tracks.findIndex(
          (track) => track.relativeUrl === clip.relativeUrl,
        )

        if (trackIndex !== -1) {
          yield call(TrackPlayer.skip, trackIndex, clip.start)
        }
      }

      yield put(bookshelfSlice.actions.playerQueued())
    },
  )
}

export function* seekToLocatorSaga() {
  yield takeEvery(
    [
      bookshelfSlice.actions.bookRelocated,
      bookshelfSlice.actions.bookPositionSynced,
      bookshelfSlice.actions.navItemTapped,
      bookshelfSlice.actions.bookmarkTapped,
      bookshelfSlice.actions.bookDoubleTapped,
    ],
    function* (action) {
      const { bookId } = action.payload

      // When we sync positions from the server, we may
      // get updates for books that are not currently being read/played,
      // in which case we should just abort
      const currentlyPlayingBook = (yield select(
        getCurrentlyPlayingBook,
      )) as ReturnType<typeof getCurrentlyPlayingBook>
      if (bookId !== currentlyPlayingBook?.id) return

      const book = (yield select(getBookshelfBook, bookId)) as ReturnType<
        typeof getBookshelfBook
      >

      if (!book) return

      const clip = (yield call(getCurrentClip, book)) as Generated<
        ReturnType<typeof getCurrentClip>
      >

      if (!clip) {
        logger.error(
          `Could not find clip for book ${bookId} at current position`,
        )
        return
      }
      logger.debug(clip)

      const tracks = (yield call(TrackPlayer.getQueue)) as BookshelfTrack[]

      const trackIndex = tracks.findIndex(
        (track) => track.relativeUrl === clip.relativeUrl,
      )

      if (trackIndex !== -1) {
        yield call(TrackPlayer.skip, trackIndex, clip.start)
      }
    },
  )
}

export function* manualTrackSeekSaga() {
  yield takeLeadingWithQueue(
    [
      playerPositionSeeked,
      playerTotalPositionSeeked,
      playerTrackChanged,
      nextTrackPressed,
      prevTrackPressed,
    ],
    function* (action) {
      const { type } = action

      // NOTE: This is currently unused, because the
      // slider UI is too unwieldy
      if (type === playerTotalPositionSeeked.type) {
        const {
          payload: { progress },
        } = action
        let skipTo = progress
        let nextTrack = null

        const tracks = (yield call(TrackPlayer.getQueue)) as Awaited<
          ReturnType<typeof TrackPlayer.getQueue>
        >
        let acc = 0
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]!
          acc += track.duration ?? 0
          if (acc > progress) break
          nextTrack = i
          skipTo -= track.duration ?? 0
        }
        if (nextTrack === null) return

        yield call(TrackPlayer.skip, nextTrack, skipTo)
      } else if (type === playerPositionSeeked.type) {
        const {
          payload: { progress },
        } = action
        yield call(TrackPlayer.seekTo, progress)
      } else if (type === playerTrackChanged.type) {
        const {
          payload: { index },
        } = action
        yield call(TrackPlayer.skip, index)
      } else if (type === nextTrackPressed.type) {
        yield call(TrackPlayer.skipToNext)
      } else if (type === prevTrackPressed.type) {
        yield call(TrackPlayer.skipToPrevious)
      }

      yield put(playerPositionUpdated())
    },
  )
}

export function* relocateToTrackPositionSaga() {
  yield takeLeadingWithQueue(
    [playerPositionUpdated, playerPaused],
    function* () {
      const currentTrack = (yield call(TrackPlayer.getActiveTrack)) as Awaited<
        ReturnType<typeof TrackPlayer.getActiveTrack>
      > as BookshelfTrack | undefined

      if (!currentTrack) return

      const { position } = (yield call(TrackPlayer.getProgress)) as Awaited<
        ReturnType<typeof TrackPlayer.getProgress>
      >

      const currentBook = (yield select(getCurrentlyPlayingBook)) as ReturnType<
        typeof getCurrentlyPlayingBook
      >
      if (!currentBook) return

      const fragment = (yield call(
        getFragment,
        currentBook.id,
        currentTrack.relativeUrl,
        position,
      )) as Awaited<ReturnType<typeof getFragment>>

      if (!fragment) {
        logger.error(
          `Could not find fragment for book ${currentBook.id}, track ${currentTrack.relativeUrl}, position ${position}.`,
        )
        return
      }

      const timestampedLocator = {
        timestamp: Date.now(),
        locator: fragment.locator,
      }

      yield put(
        bookshelfSlice.actions.playerPositionUpdateCompleted({
          bookId: currentBook.id,
          locator: timestampedLocator,
        }),
      )
    },
  )
}

export function* deleteBookSaga() {
  yield takeEvery(bookshelfSlice.actions.bookDeleted, function* (action) {
    const { bookId } = action.payload

    yield call(deleteBook, bookId)
    yield call(deleteLocalBookFiles, bookId)
  })
}

export function* deleteBookmarkSaga() {
  yield takeEvery(bookshelfSlice.actions.bookmarksRemoved, function* (action) {
    const { bookId, locators } = action.payload

    for (const locator of locators) {
      yield call(deleteBookmark, bookId, locator)
    }
  })
}

export function* writeBookmarkSaga() {
  yield takeEvery(bookshelfSlice.actions.bookmarkAdded, function* (action) {
    const { bookId, locator } = action.payload

    yield call(writeBookmark, bookId, locator)
  })
}

export function* deleteHighlightSaga() {
  yield takeEvery(bookshelfSlice.actions.highlightRemoved, function* (action) {
    const { bookId, highlightId } = action.payload

    yield call(deleteHighlight, bookId, highlightId)
  })
}

export function* writeHighlightSaga() {
  yield takeEvery(bookshelfSlice.actions.highlightCreated, function* (action) {
    const { bookId, highlight } = action.payload

    yield call(writeHighlight, bookId, highlight)
  })
}

export function* updatePlayerSpeedSaga() {
  yield takeEvery(
    preferencesSlice.actions.playerSpeedChanged,
    function* (action) {
      const { speed } = action.payload

      yield call(TrackPlayer.setRate, speed)
    },
  )
}
