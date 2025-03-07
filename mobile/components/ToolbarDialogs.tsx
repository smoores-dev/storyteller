import { SpeedMenu } from "./SpeedMenu"
import { useAppSelector, useAppDispatch } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"
import { getOpenDialog } from "../store/selectors/toolbarSelectors"
import { ToolbarDialog, toolbarSlice } from "../store/slices/toolbarSlice"
import { BookNavigation } from "./BookNavigation"
import { BookSettingsMenu } from "./BookSettingsMenu"
import { Platform } from "react-native"

interface Props {
  mode: "text" | "audio"
  topInset?: number | undefined
}

export function ToolbarDialogs({ mode, topInset: topInsetProp = 0 }: Props) {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const openDialog = useAppSelector(getOpenDialog)
  const topInset = topInsetProp + (Platform.OS === "android" ? 24 : 0)

  const dispatch = useAppDispatch()

  if (!book) return null

  return (
    <>
      {openDialog === ToolbarDialog.TABLE_OF_CONTENTS && (
        <BookNavigation
          mode={mode}
          topInset={topInset}
          onOutsideTap={() => {
            dispatch(toolbarSlice.actions.dialogClosed())
          }}
        />
      )}

      {openDialog === ToolbarDialog.SPEED && (
        <SpeedMenu
          bookId={book.id}
          topInset={topInset}
          onOutsideTap={() => {
            dispatch(toolbarSlice.actions.dialogClosed())
          }}
        />
      )}

      {openDialog === ToolbarDialog.SETTINGS && (
        <BookSettingsMenu bookId={book.id} />
      )}
    </>
  )
}
