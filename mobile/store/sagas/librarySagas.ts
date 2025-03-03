import * as FileSystem from "expo-file-system"
import { call, put, select, spawn, take, takeEvery } from "redux-saga/effects"
import { getApiClient } from "../selectors/apiSelectors"
import { LibraryBook, librarySlice } from "../slices/librarySlice"
import { authSlice } from "../slices/authSlice"
import {
  Generated,
  createDownloadChannel,
  extractBookArchive,
  parseLocalizedString,
  readiumToStorytellerAuthors,
  runDownload,
} from "./bookshelfSagas"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { logger } from "../../logger"
import { BookDetail } from "../../apiModels"
import {
  getPositions,
  locateLink,
  openPublication,
} from "../../modules/readium"
import { bookshelfSlice } from "../slices/bookshelfSlice"

export function* hydrateExistingDownloads() {
  const allKeys = (yield call(AsyncStorage.getAllKeys)) as Awaited<
    ReturnType<typeof AsyncStorage.getAllKeys>
  >

  const existingDownloadKeys = allKeys.filter((key) =>
    key.startsWith("book-download:"),
  )
  const existingDownloadIds = existingDownloadKeys.map((key) =>
    key.replace("book-download:", ""),
  )

  for (const bookId of existingDownloadIds) {
    const downloadSnapshotJson = (yield call(
      AsyncStorage.getItem,
      `book-download:${bookId}`,
    )) as Awaited<ReturnType<typeof AsyncStorage.getItem>>
    if (downloadSnapshotJson === null) continue

    const { download: downloadSnapshot, book } = JSON.parse(
      downloadSnapshotJson,
    ) as { download: FileSystem.DownloadPauseState; book: LibraryBook }

    // It seems like when an app is killed, iOS removes
    // whatever temp files expo-fs is using to maintain the
    // download state, resulting in incomplete download files.
    // As such, when we restart the app after its killed, we have to
    // start downloads from 0 again, so we drop the resumeData.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { resumeData: _, ...downloadRestartSnapshot } = downloadSnapshot

    const { progressChannel, download } = createDownloadChannel(
      downloadRestartSnapshot,
    )

    yield put(
      librarySlice.actions.libraryDownloadHydrated({
        book,
      }),
    )

    yield spawn(function* () {
      logger.info(`Restarting download from ${downloadRestartSnapshot.url}`)
      yield call(runDownload, book.id, progressChannel, download)
      const extractedPath = (yield call(
        extractBookArchive,
        book.id,
      )) as Generated<ReturnType<typeof extractBookArchive>>

      const manifest = (yield call(
        openPublication,
        book.id,
        extractedPath,
      )) as Awaited<ReturnType<typeof openPublication>>

      const positions = (yield call(getPositions, book.id)) as Awaited<
        ReturnType<typeof getPositions>
      >

      const firstLink = manifest.readingOrder[0]

      if (!firstLink)
        throw new Error(
          `Failed to parse book ${book.title}: No reading order found`,
        )

      const firstLocator = (yield call(
        locateLink,
        book.id,
        firstLink,
      )) as Awaited<ReturnType<typeof locateLink>>

      yield put(
        bookshelfSlice.actions.bookDownloadCompleted({
          book: {
            id: book.id,
            title: parseLocalizedString(manifest.metadata.title),
            authors: readiumToStorytellerAuthors(manifest.metadata.author),
            manifest,
            positions,
            highlights: [],
            bookmarks: [],
          },
          locator: { locator: firstLocator, timestamp: Date.now() },
        }),
      )
    })
  }
}

export function* requestLibrarySaga() {
  yield takeEvery(
    [
      librarySlice.actions.libraryTabOpened,
      librarySlice.actions.libraryRefreshed,
    ],
    function* () {
      let apiClient = (yield select(getApiClient)) as ReturnType<
        typeof getApiClient
      >

      if (!apiClient?.isAuthenticated()) {
        yield take([
          authSlice.actions.loggedIn,
          authSlice.actions.accessTokenHydrated,
        ])

        apiClient = (yield select(getApiClient)) as ReturnType<
          typeof getApiClient
        >
      }

      if (!apiClient) {
        logger.error("Failed to authenticate API client")
        return
      }

      let books: BookDetail[]
      try {
        books = (yield call([apiClient, apiClient.listBooks])) as Awaited<
          ReturnType<typeof apiClient.listBooks>
        >
      } catch (error) {
        logger.error(error)
        alert(`Failed to load library:\n${(error as Error).toString()}`)
        return
      }

      yield put(librarySlice.actions.libraryLoaded({ bookDetails: books }))
    },
  )
}
