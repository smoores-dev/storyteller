import { SpeedMenu } from "./SpeedMenu"
import { useAppSelector, useAppDispatch } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"
import { getOpenDialog } from "../store/selectors/toolbarSelectors"
import { ToolbarDialog, toolbarSlice } from "../store/slices/toolbarSlice"
import { BookNavigation } from "./BookNavigation"
import { BookSettingsMenu } from "./BookSettingsMenu"

export function ToolbarDialogs() {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const openDialog = useAppSelector(getOpenDialog)

  const dispatch = useAppDispatch()

  if (!book) return null

  return (
    <>
      {openDialog === ToolbarDialog.TABLE_OF_CONTENTS && (
        <BookNavigation
          onOutsideTap={() => {
            dispatch(toolbarSlice.actions.dialogClosed())
          }}
        />
      )}

      {openDialog === ToolbarDialog.SPEED && (
        <SpeedMenu
          bookId={book.id}
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
