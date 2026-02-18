import { AppState } from "react-native"

import { Storyteller } from "@/modules/readium"
import { playerClipChanged } from "@/store/actions"
import { type AppStore } from "@/store/appState"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"

function listenWhenActive(...args: Parameters<typeof Storyteller.addListener>) {
  AppState.addEventListener("change", (appState) => {
    if (appState === "active") {
      Storyteller.addListener(...args)
    } else {
      Storyteller.removeListener(...args)
    }
  })

  if (AppState.currentState === "active") {
    Storyteller.addListener(...args)
  }
}

export function addStorytellerEventListeners(store: AppStore) {
  listenWhenActive("positionChanged", ({ position }) => {
    store.dispatch(bookshelfSlice.actions.audioPositionChanged({ position }))
  })

  listenWhenActive("trackChanged", ({ track, position }) => {
    store.dispatch(
      bookshelfSlice.actions.audioTrackChanged({ track, position }),
    )
  })

  Storyteller.addListener("isPlayingChanged", ({ isPlaying }) => {
    store.dispatch(bookshelfSlice.actions.isPlayingChanged({ isPlaying }))
  })

  listenWhenActive("clipChanged", (clip) => {
    store.dispatch(playerClipChanged({ clip }))
  })

  AppState.addEventListener("change", (appState) => {
    if (appState === "active") {
      Storyteller.getIsPlaying().then((isPlaying) => {
        store.dispatch(bookshelfSlice.actions.isPlayingChanged({ isPlaying }))

        // If the audio is currently playing, then do a one-time catch up so that
        // we can display the correct highlight in the reader.
        //
        // If not, then we will have caught up when the player paused/stopped
        if (isPlaying) {
          Storyteller.getCurrentClip().then((clip) => {
            if (!clip) return
            store.dispatch(playerClipChanged({ clip }))
          })
        }
      })

      Promise.all([
        Storyteller.getPosition(),
        Storyteller.getCurrentTrack(),
      ]).then(([position, track]) => {
        if (!track) return
        store.dispatch(
          bookshelfSlice.actions.audioTrackChanged({ track, position }),
        )
      })
    }
  })
}
