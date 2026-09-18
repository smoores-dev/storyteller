import { type HotkeyItem, useHotkeys } from "@mantine/hooks"

import { readerPlayer } from "@/services/AudioPlayerService"
import {
  nextPagePressed,
  pauseShortCutPressed,
  playShortCutPressed,
  previousPagePressed,
  skipPartButtonPressed,
} from "@/store/actions"
import {
  type AppDispatch,
  useAppDispatch,
  useAppSelector,
} from "@/store/appState"
import { preferencesSlice } from "@/store/slices/preferencesSlice"
import { selectReadingMode } from "@/store/slices/readingSessionSlice"
import { type UUID } from "@/uuid"

export const getReaderKeyboardHotkeys = (
  dispatch: AppDispatch,
  mode: "epub" | "audiobook" | "readaloud" | null,
  bookId: UUID,
) =>
  [
    [
      "ArrowLeft",
      () => {
        dispatch(
          skipPartButtonPressed({ direction: "previous", context: "reader" }),
        )
      },
    ],
    [
      "Shift+ArrowLeft",
      () => {
        dispatch(previousPagePressed())
      },
    ],
    [
      "ArrowRight",
      () => {
        dispatch(
          skipPartButtonPressed({ direction: "next", context: "reader" }),
        )
      },
    ],
    [
      "Shift+ArrowRight",
      () => {
        dispatch(nextPagePressed())
      },
    ],
    [
      "Space",
      () => {
        if (mode === "epub") {
          return
        }
        if (readerPlayer().getState().playing) {
          dispatch(pauseShortCutPressed())
        } else {
          dispatch(playShortCutPressed())
        }
      },
    ],
    [
      ".",
      () => {
        readerPlayer().setPlaybackRate(
          readerPlayer().getState().playbackRate + 0.25,
        )
        dispatch(
          preferencesSlice.actions.incrementPlaybackRate({
            target: bookId,
            value: 0.25,
          }),
        )
      },
    ],
    [
      ",",
      () => {
        readerPlayer().setPlaybackRate(
          readerPlayer().getState().playbackRate - 0.25,
        )
        dispatch(
          preferencesSlice.actions.incrementPlaybackRate({
            target: bookId,
            value: -0.25,
          }),
        )
      },
    ],
  ] satisfies HotkeyItem[]

export const useReaderKeyboard = (bookId: UUID) => {
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectReadingMode)

  useHotkeys(getReaderKeyboardHotkeys(dispatch, mode, bookId))
}
