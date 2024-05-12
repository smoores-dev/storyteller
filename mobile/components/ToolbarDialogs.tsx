import { locateLink } from "../modules/readium"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import { SpeedMenu } from "./SpeedMenu"
import { TableOfContents } from "./TableOfContents"
import { useAppSelector, useAppDispatch } from "../store/appState"
import {
  getCurrentlyPlayingBook,
  getLocator,
} from "../store/selectors/bookshelfSelectors"
import { getOpenDialog } from "../store/selectors/toolbarSelectors"
import { ToolbarDialog, toolbarSlice } from "../store/slices/toolbarSlice"

export function ToolbarDialogs() {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const openDialog = useAppSelector(getOpenDialog)
  const locator = useAppSelector((state) => book && getLocator(state, book.id))

  const dispatch = useAppDispatch()

  if (!book) return null

  return (
    <>
      {openDialog === ToolbarDialog.TABLE_OF_CONTENTS && (
        <TableOfContents
          locator={locator}
          navItems={book.manifest.toc}
          onNavItemTap={async (item) => {
            const link = book.manifest.readingOrder.find(
              ({ href }) => href === item.href,
            )
            if (!link) return

            const locator = await locateLink(book.id, link)

            dispatch(
              bookshelfSlice.actions.navItemTapped({
                bookId: book.id,
                locator,
              }),
            )
          }}
          onOutsideTap={() => {
            dispatch(toolbarSlice.actions.dialogClosed())
          }}
        />
      )}

      {openDialog === ToolbarDialog.SPEED && (
        <SpeedMenu
          onOutsideTap={() => {
            dispatch(toolbarSlice.actions.dialogClosed())
          }}
        />
      )}
    </>
  )
}
