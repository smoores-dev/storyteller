import { isAnyOf } from "@reduxjs/toolkit"

import {
  type AudioClip,
  getAudiobookLocator,
  getFragmentForClip,
} from "@/components/reader/BookService"
import { isSameLocator } from "@/components/reader/locators"
import { AudioPlayer } from "@/services/AudioPlayerService"
import {
  bookLocatorChanged,
  pauseButtonPressed,
  pauseShortCutPressed,
  playButtonPressed,
  playShortCutPressed,
  playerPositionSeeked,
  playerPositionUpdated,
  playerTotalPositionSeeked,
  playerTrackChanged,
  requestHighlightUpdate,
  syncPosition,
  textNavigatedFromAudio,
} from "@/store/actions"
import { getActiveFrame, getPublication } from "@/store/readerRegistry"
import { selectPreference } from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
  selectCurrentLocator,
  selectIsSyncing,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import {
  clearHighlight,
  getClipForLocatorMultipleAudioForOneHtml,
  getGuideForTrack,
} from "./helpers"
import { startAppListening } from "./listenerMiddleware"

const matchBookLocatorUpdate = isAnyOf(bookLocatorChanged)

startAppListening({
  matcher: matchBookLocatorUpdate,
  effect: async (action, listenerApi) => {
    const isSyncing = selectIsSyncing(listenerApi.getState())
    if (!isSyncing) return

    const { bookUuid, locator } = action.payload
    const book = selectCurrentBook(listenerApi.getState())

    if (bookUuid !== book?.uuid) return

    let clip: AudioClip | null = null

    clip = (await getClipForLocatorMultipleAudioForOneHtml(locator)) ?? null

    if (!clip) return

    const tracks = AudioPlayer.getQueue()
    const trackIndex = tracks.findIndex(
      (track) => track.relativeUrl === clip.audioResource,
    )

    if (trackIndex !== -1) {
      await AudioPlayer.skip(trackIndex, clip.start)
      await AudioPlayer.play()
    }
  },
})

const matchManualPlayerPositionUpdate = isAnyOf(
  playerTotalPositionSeeked,
  playerPositionSeeked,
  playerTrackChanged,
)

// handle UI-initiated audio control actions
startAppListening({
  matcher: matchManualPlayerPositionUpdate,
  effect: async (action, listenerApi) => {
    switch (action.type) {
      case playerTotalPositionSeeked.type: {
        const { progress } = action.payload

        let skipTo = progress
        let nextTrack = null

        const tracks = AudioPlayer.getQueue()

        let acc = 0
        for (let i = 0; i < tracks.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const track = tracks[i]!
          acc += track.duration ?? 0
          if (acc > progress) break
          nextTrack = i
          skipTo -= track.duration ?? 0
        }
        if (nextTrack === null) return

        await AudioPlayer.skip(nextTrack, skipTo)
        break
      }
      case playerPositionSeeked.type: {
        const { progress } = action.payload
        AudioPlayer.seekTo(progress)
        break
      }
      case playerTrackChanged.type: {
        const { index } = action.payload
        await AudioPlayer.skip(index)
        break
      }
    }

    // notify that audio position changed (may trigger text sync)
    listenerApi.dispatch(playerPositionUpdated())
  },
})

const matchPlayerUpdatedOrPaused = isAnyOf(playerPositionUpdated)

// sync the text position to the audio position when audio position changes regularly
startAppListening({
  matcher: matchPlayerUpdatedOrPaused,
  effect: async (_, listenerApi) => {
    listenerApi.unsubscribe()

    let queued = false as boolean // otherwise TS complains

    listenerApi
      .take((action) => {
        return action.type === playerPositionUpdated.type
      })
      .then(() => {
        queued = true
      })
      .catch(() => {
        queued = false
      })

    try {
      const currentTrack = AudioPlayer.getActiveTrack()
      const mode = selectReadingMode(listenerApi.getState())

      if (!currentTrack) return

      const currentBook = selectCurrentBook(listenerApi.getState())
      if (!currentBook) return

      const { position: rawPosition } = AudioPlayer.getProgress()
      const offset = selectPreference(listenerApi.getState(), "syncOffset")
      const position = rawPosition + offset

      const publication = getPublication()
      if (!publication) return

      if (mode === "audiobook") {
        const locator = getAudiobookLocator(
          position,
          AudioPlayer.getState().trackIndex,
          AudioPlayer.getQueue(),
        )
        if (!locator) return
        listenerApi.dispatch(
          syncPosition({
            bookUuid: currentBook.uuid,
            locator: locator,
            timestamp: Date.now(),
          }),
        )
        return
      }

      const guides = await getGuideForTrack(
        publication,
        currentTrack.relativeUrl,
        position,
      )
      if (!guides || guides.length === 0) return

      listenerApi.throwIfCancelled()

      const fragments = (
        await Promise.all(
          guides.map(async (guide) => {
            return getFragmentForClip(guide, currentTrack.relativeUrl, position)
          }),
        )
      ).filter((fragment) => fragment != null)

      if (fragments.length === 0) {
        console.error(
          "No fragments found for audio track:",
          currentTrack.relativeUrl,
        )
        return
      }

      // TODO: properly handle multiple texts per audio track
      if (fragments.length > 1) {
        console.error(
          "Multiple fragments found for audio track:",
          currentTrack.relativeUrl,
        )
      }

      const fragment = fragments[0]
      if (!fragment || !fragment.locator) return

      const isSyncing = selectIsSyncing(listenerApi.getState())

      if (isSyncing && fragment.locator.locations.fragments[0]) {
        listenerApi.dispatch(
          requestHighlightUpdate({
            locator: fragment.locator,
          }),
        )
      }

      const currentLocator = selectCurrentLocator(listenerApi.getState())

      // always sync position for saving progress
      listenerApi.dispatch(
        syncPosition({
          bookUuid: currentBook.uuid,
          locator: fragment.locator,
          timestamp: Date.now(),
        }),
      )

      if (!isSyncing) return

      // don't navigate if already at same location
      if (currentLocator && isSameLocator(currentLocator, fragment.locator)) {
        return
      }

      // navigate text to match audio using textNavigatedFromAudio
      // this action does NOT trigger audio update (no bookLocatorChanged dispatch)
      listenerApi.dispatch(
        textNavigatedFromAudio({ locator: fragment.locator }),
      )
    } finally {
      listenerApi.subscribe()
      if (queued) {
        listenerApi.dispatch(playerPositionUpdated())
      }
    }
  },
})

const matchSyncingDisabled = isAnyOf(readingSessionSlice.actions.setSyncing)

// clear highlight when syncing is disabled
startAppListening({
  matcher: matchSyncingDisabled,
  effect: (action) => {
    const activeFrame = getActiveFrame()
    if (activeFrame && !action["payload"]) {
      clearHighlight(activeFrame)
    }
  },
})

const matchTogglePlay = isAnyOf(
  pauseButtonPressed,
  playButtonPressed,
  pauseShortCutPressed,
  playShortCutPressed,
)

startAppListening({
  matcher: matchTogglePlay,
  effect: async (_) => {
    if (AudioPlayer.getState().playing) {
      AudioPlayer.pause()
    } else {
      await AudioPlayer.play()
    }
  },
})
