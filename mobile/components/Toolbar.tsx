import { Link } from "expo-router"
import { StyleSheet, View } from "react-native"
import { useAppDispatch, useAppSelector } from "../store/appState"
import {
  getCurrentlyPlayingBook,
  getLocator,
  getSleepTimer,
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
  ClockFading,
  Gauge,
  Headphones,
  TableOfContents,
} from "lucide-react-native"
import { useColorTheme } from "../hooks/useColorTheme"
import { Button } from "./ui/Button"
import { UIText } from "./UIText"
import { getBookPlayerSpeed } from "../store/selectors/preferencesSelectors"
import { spacing } from "./ui/tokens/spacing"
import ContextMenu from "react-native-context-menu-view"
import { intervalToDuration, isPast } from "date-fns"
import { useEffect, useState } from "react"

type Props = {
  mode: "audio" | "text"
  activeBookmarks: ReadiumLocator[]
}

function formatSleepTimer(sleepTimer: Date) {
  const duration = intervalToDuration({
    start: new Date(),
    end: sleepTimer,
  })
  const minutes = String(
    (duration.minutes ?? 0) + (duration.hours ? duration.hours * 60 : 0),
  ).padStart(2, "0")
  const seconds = String(duration.seconds ?? 0).padStart(2, "0")
  return `${minutes}:${seconds}`
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

  const [formattedSleepTimer, setFormattedSleepTimer] = useState<string | null>(
    null,
  )

  const sleepTimer = useAppSelector(getSleepTimer)

  useEffect(() => {
    if (sleepTimer) {
      const intervalId = setInterval(() => {
        if (isPast(sleepTimer)) {
          clearInterval(intervalId)
          setFormattedSleepTimer(null)
          return
        }
        setFormattedSleepTimer(formatSleepTimer(sleepTimer))
      }, 500)
      return () => clearInterval(intervalId)
    } else {
      setFormattedSleepTimer(null)
    }
    return () => {}
  }, [sleepTimer])

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
        <ContextMenu
          actions={[
            {
              title: "Off",
            },
            {
              title: "5 Mins",
            },
            {
              title: "10 Mins",
            },
            {
              title: "15 Mins",
            },
            {
              title: "30 Mins",
            },
            {
              title: "45 Mins",
            },
            {
              title: "60 Mins",
            },
            {
              title: "90 Mins",
            },
            {
              title: "120 Mins",
            },
            ...(__DEV__
              ? [{ title: "5 seconds" }, { title: "30 seconds" }]
              : []),
          ]}
          onPress={({ nativeEvent }) => {
            const sleepTimer = new Date()
            switch (nativeEvent.index) {
              case 0: {
                dispatch(
                  bookshelfSlice.actions.sleepTimerSet({ sleepTimer: null }),
                )
                return
              }
              case 1: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 5)
                break
              }
              case 2: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 10)
                break
              }
              case 3: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 15)
                break
              }
              case 4: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 30)
                break
              }
              case 5: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 45)
                break
              }
              case 6: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 60)
                break
              }
              case 7: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 90)
                break
              }
              case 8: {
                sleepTimer.setMinutes(sleepTimer.getMinutes() + 120)
                break
              }
              case 9: {
                sleepTimer.setSeconds(sleepTimer.getSeconds() + 5)
                break
              }
              case 10: {
                sleepTimer.setSeconds(sleepTimer.getSeconds() + 30)
                break
              }
              default: {
                return
              }
            }
            dispatch(bookshelfSlice.actions.sleepTimerSet({ sleepTimer }))
          }}
          dropdownMenuMode
        >
          <Button
            style={[styles.toolbarButton, styles.toolbarTextButton]}
            chromeless
          >
            {formattedSleepTimer ? (
              <UIText
                maxFontSizeMultiplier={1.75}
                style={styles.toolbarTextButton}
              >
                {formattedSleepTimer}
              </UIText>
            ) : (
              <ClockFading color={foreground} />
            )}
          </Button>
        </ContextMenu>

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
