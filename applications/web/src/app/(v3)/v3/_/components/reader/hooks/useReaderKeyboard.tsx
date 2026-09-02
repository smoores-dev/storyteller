import { type Hotkey, useHotkeys } from "@tanstack/react-hotkeys"

import { isRtlPublication } from "@v3/_/components/reader/helpers"

import { readerPlayer } from "@/services/AudioPlayerService"
import {
  nextPagePressed,
  pauseShortCutPressed,
  playShortCutPressed,
  previousPagePressed,
  skipPartButtonPressed,
} from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { preferencesSlice } from "@/store/slices/preferencesSlice"
import {
  selectIsLoadingPublication,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"
import { type UUID } from "@/uuid"

export function getReaderShortcuts(rtl = false) {
  return {
    previousFragment: (rtl ? "ArrowRight" : "ArrowLeft") as Hotkey,
    nextFragment: (rtl ? "ArrowLeft" : "ArrowRight") as Hotkey,
    previousPage: (rtl ? "Shift+ArrowRight" : "Shift+ArrowLeft") as Hotkey,
    nextPage: (rtl ? "Shift+ArrowLeft" : "Shift+ArrowRight") as Hotkey,
    togglePlay: "Space" as Hotkey,
    faster: "." as Hotkey,
    slower: "," as Hotkey,
    fullscreen: "F" as Hotkey,
    revealUi: "Escape" as Hotkey,
  }
}

export function useReaderShortcuts() {
  const publicationLoading = useAppSelector(selectIsLoadingPublication)
  return getReaderShortcuts(!publicationLoading && isRtlPublication())
}

export const useReaderKeyboard = ({
  bookId,
  onToggleFullscreen,
  onRevealUi,
}: {
  bookId: UUID
  onToggleFullscreen?: (() => void) | undefined
  onRevealUi?: (() => void) | undefined
}) => {
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectReadingMode)
  const shortcuts = useReaderShortcuts()

  const changePlaybackRate = (value: number) => {
    readerPlayer().setPlaybackRate(
      readerPlayer().getState().playbackRate + value,
    )
    dispatch(
      preferencesSlice.actions.incrementPlaybackRate({ target: bookId, value }),
    )
  }

  useHotkeys([
    {
      hotkey: shortcuts.previousFragment,
      callback: () => {
        dispatch(
          skipPartButtonPressed({ direction: "previous", context: "reader" }),
        )
      },
    },
    {
      hotkey: shortcuts.nextFragment,
      callback: () => {
        dispatch(
          skipPartButtonPressed({ direction: "next", context: "reader" }),
        )
      },
    },
    {
      hotkey: shortcuts.previousPage,
      callback: () => {
        dispatch(previousPagePressed())
      },
    },
    {
      hotkey: shortcuts.nextPage,
      callback: () => {
        dispatch(nextPagePressed())
      },
    },
    {
      hotkey: shortcuts.togglePlay,
      callback: () => {
        if (readerPlayer().getState().playing) {
          dispatch(pauseShortCutPressed())
        } else {
          dispatch(playShortCutPressed())
        }
      },
      options: { enabled: mode !== "epub" },
    },
    {
      hotkey: shortcuts.faster,
      callback: () => {
        changePlaybackRate(0.25)
      },
      options: { enabled: mode !== "epub" },
    },
    {
      hotkey: shortcuts.slower,
      callback: () => {
        changePlaybackRate(-0.25)
      },
      options: { enabled: mode !== "epub" },
    },
    {
      hotkey: shortcuts.fullscreen,
      callback: () => {
        onToggleFullscreen?.()
      },
      options: { enabled: onToggleFullscreen !== undefined },
    },
    {
      hotkey: shortcuts.revealUi,
      callback: () => {
        onRevealUi?.()
      },
      options: {
        enabled: onRevealUi !== undefined,
        preventDefault: false,
        stopPropagation: false,
      },
    },
  ])
}
