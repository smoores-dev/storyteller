import { Link } from "expo-router"
import { StyleSheet, View } from "react-native"
import { useAppDispatch, useAppSelector } from "../store/appState"
import {
  getCurrentlyPlayingBook,
  getLocator,
} from "../store/selectors/bookshelfSelectors"
import { ToolbarDialog, toolbarSlice } from "../store/slices/toolbarSlice"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import { ReadiumLocator } from "../modules/readium/src/Readium.types"
import { getOpenDialog } from "../store/selectors/toolbarSelectors"
import {
  Bookmark,
  BookmarkCheck,
  BookOpen,
  CaseSensitive,
  Gauge,
  Headphones,
  TableOfContents,
} from "lucide-react-native"
import { useColorTheme } from "../hooks/useColorTheme"
import { Button } from "./ui/Button"
import { UIText } from "./UIText"
import { getBookPlayerSpeed } from "../store/selectors/preferencesSelectors"
import { spacing } from "./ui/tokens/spacing"

type Props = {
  mode: "audio" | "text"
  activeBookmarks: ReadiumLocator[]
}

export function Toolbar({ mode, activeBookmarks }: Props) {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const currentLocator = useAppSelector(
    (state) => book && getLocator(state, book.id),
  )
  const openDialog = useAppSelector(getOpenDialog)
  const currentSpeed = useAppSelector(
    (state) => book && getBookPlayerSpeed(state, book.id),
  )

  const { foreground, surface } = useColorTheme()

  const dispatch = useAppDispatch()

  if (!book) return null

  return (
    <>
      <View style={styles.toolbar}>
        {mode === "text" && (
          <Button
            chromeless
            style={[
              styles.toolbarButton,
              openDialog === ToolbarDialog.SETTINGS && {
                backgroundColor: surface,
              },
            ]}
            onPress={() => {
              dispatch(
                toolbarSlice.actions.dialogToggled({
                  dialog: ToolbarDialog.SETTINGS,
                }),
              )
            }}
          >
            <CaseSensitive
              style={{ marginBottom: -2, marginTop: 2 }}
              color={foreground}
            />
          </Button>
        )}

        <Button
          style={[
            styles.toolbarButton,
            openDialog === ToolbarDialog.SPEED && { backgroundColor: surface },
          ]}
          chromeless
          onPress={() => {
            dispatch(
              toolbarSlice.actions.dialogToggled({
                dialog: ToolbarDialog.SPEED,
              }),
            )
          }}
        >
          {currentSpeed === 1 ? (
            <Gauge color={foreground} />
          ) : (
            <UIText
              maxFontSizeMultiplier={1.75}
              style={[styles.toolbarTextButton, { fontWeight: "bold" }]}
            >
              {currentSpeed}x
            </UIText>
          )}
        </Button>

        <Button
          chromeless
          style={[
            styles.toolbarButton,
            openDialog === ToolbarDialog.TABLE_OF_CONTENTS && {
              backgroundColor: surface,
            },
          ]}
          onPress={() => {
            dispatch(
              toolbarSlice.actions.dialogToggled({
                dialog: ToolbarDialog.TABLE_OF_CONTENTS,
              }),
            )
          }}
        >
          <TableOfContents color={foreground} />
        </Button>

        <Button
          style={styles.toolbarButton}
          chromeless
          onPress={() => {
            if (activeBookmarks.length) {
              dispatch(
                bookshelfSlice.actions.bookmarksRemoved({
                  bookId: book.id,
                  locators: activeBookmarks,
                }),
              )
            } else if (currentLocator) {
              dispatch(
                bookshelfSlice.actions.bookmarkAdded({
                  bookId: book.id,
                  locator: currentLocator.locator,
                }),
              )
            }
          }}
        >
          {activeBookmarks.length ? (
            <BookmarkCheck color={foreground} />
          ) : (
            <Bookmark color={foreground} />
          )}
        </Button>

        {mode === "audio" ? (
          <Link
            asChild
            replace
            href={{ pathname: "/book/[id]", params: { id: book.id } }}
          >
            <Button chromeless style={styles.toolbarButton}>
              <BookOpen color={foreground} />
            </Button>
          </Link>
        ) : (
          <Link asChild href={{ pathname: "/player" }}>
            <Button chromeless style={styles.toolbarButton}>
              <Headphones color={foreground} />
            </Button>
          </Link>
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["0.5"],
  },
  toolbarButton: {
    minWidth: spacing[5],
    paddingVertical: spacing[1],
    paddingHorizontal: "auto",
    borderRadius: 4,
    alignItems: "center",
  },
  toolbarTextButton: {
    paddingHorizontal: spacing[1],
  },
  toolbarLink: {
    marginBottom: -spacing[1.5],
  },
  settingsButton: {
    marginHorizontal: 0,
  },
})
