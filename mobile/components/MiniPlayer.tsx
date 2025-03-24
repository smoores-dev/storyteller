import { Image, Platform, Pressable, StyleSheet, View } from "react-native"
import {
  getLocalAudioBookCoverUrl,
  getLocalBookCoverUrl,
} from "../store/persistence/files"
import { ProgressBar } from "./ProgressBar"
import { PlayPause } from "./PlayPause"
import {
  BookshelfBook,
  bookshelfSlice,
  nextFragmentPressed,
  playerPositionSeeked,
  playerTotalPositionSeeked,
  previousFragmentPressed,
} from "../store/slices/bookshelfSlice"
import { UIText } from "./UIText"
import { useState, useMemo, useEffect, useRef } from "react"
import { useAudioBook, formatTimeHuman } from "../hooks/useAudioBook"
import { isSameChapter } from "../links"
import { useAppSelector, useAppDispatch } from "../store/appState"
import { getLocator } from "../store/selectors/bookshelfSelectors"
import { getBookPreferences } from "../store/selectors/preferencesSelectors"
import { spacing } from "./ui/tokens/spacing"
import { preferencesSlice } from "../store/slices/preferencesSlice"
import { fontSizes } from "./ui/tokens/fontSizes"
import { FastForward, Rewind } from "lucide-react-native"
import { useColorTheme } from "../hooks/useColorTheme"
import { Button } from "./ui/Button"
import { throttle } from "../throttle"

// Roughly the number of "positions" that fit in a
// standard paperback book page
const PAPERBACK_PAGE_SCALE = 3

type Props = {
  book: BookshelfBook
  automaticRewind: boolean
}

export function MiniPlayer({ book, automaticRewind }: Props) {
  const { foreground } = useColorTheme()
  const locator = useAppSelector((state) => getLocator(state, book.id))
  const bookPrefs = useAppSelector((state) =>
    getBookPreferences(state, book.id),
  )
  const { track, total, rate } = useAudioBook()
  const trackPositionRef = useRef(track.position)
  trackPositionRef.current = track.position

  const dispatch = useAppDispatch()
  const [eagerProgress, setEagerProgress] = useState(track.position)

  const syncEagerProgress = useMemo(() => {
    return throttle(() => {
      setEagerProgress(positionRef.current)
    }, 200)
  }, [])

  useEffect(() => {
    syncEagerProgress()
  }, [total.position, track.position, locator, syncEagerProgress])

  useEffect(() => {
    return () => {
      syncEagerProgress.cancel()
    }
  }, [syncEagerProgress])

  useEffect(() => {
    setEagerProgress(positionRef.current)
  }, [bookPrefs?.detailView?.scope, bookPrefs?.detailView?.mode])

  const chapterTitle = useMemo(() => {
    if (!book.manifest.toc) return undefined

    for (const link of book.manifest.toc) {
      if (isSameChapter(link.href, locator?.locator.href ?? "")) {
        return link.title
      }
      if (!link.children) continue
      for (const childLink of link.children) {
        if (isSameChapter(childLink.href, locator?.locator.href ?? "")) {
          return childLink.title
        }
      }
    }
    return undefined
  }, [book.manifest.toc, locator?.locator.href])

  const chapterPositions = useMemo(() => {
    return book.positions.filter(
      (position) => position.href === locator?.locator.href,
    )
  }, [book.positions, locator?.locator.href])

  const positionRef = useRef(total.position)
  positionRef.current = useMemo(
    () =>
      bookPrefs?.detailView?.mode === "audio"
        ? bookPrefs?.detailView?.scope === "book"
          ? total.position
          : track.position
        : bookPrefs?.detailView?.scope === "book"
          ? locator?.locator.locations?.position ??
            book.positions.findIndex(
              (position) =>
                (position.locations?.totalProgression ?? 0) >=
                (locator?.locator.locations?.totalProgression ?? 0),
            ) ??
            0
          : chapterPositions.findIndex(
              (position) =>
                (position.locations?.progression ?? 0) >=
                (locator?.locator.locations?.progression ?? 0),
            ) ?? 0,
    [
      book.positions,
      bookPrefs?.detailView?.mode,
      bookPrefs?.detailView?.scope,
      chapterPositions,
      locator?.locator.locations?.position,
      locator?.locator.locations?.progression,
      locator?.locator.locations?.totalProgression,
      total.position,
      track.position,
    ],
  )

  const { title, formattedProgress } = useMemo(() => {
    if (bookPrefs?.detailView?.mode === "audio") {
      if (bookPrefs.detailView.scope === "book") {
        return {
          title: book.title,
          formattedProgress: `${formatTimeHuman(
            total.endPosition / rate - eagerProgress / rate,
          )} left`,
        }
      }
      return {
        title: `Track ${track.index + 1} of ${total.trackCount}`,
        formattedProgress: `${formatTimeHuman(
          track.endPosition / rate - eagerProgress / rate,
        )} left`,
      }
    }
    if (bookPrefs?.detailView?.scope === "book") {
      const position =
        locator?.locator.locations?.position ??
        (book.positions.findIndex(
          (position) =>
            (position.locations?.totalProgression ?? 0) >=
            (locator?.locator.locations?.totalProgression ?? 0),
        ) ?? 0) + 1
      return {
        title: book.title,
        formattedProgress: `pg. ${Math.ceil(position / PAPERBACK_PAGE_SCALE) || 1} / ${Math.ceil(book.positions.length / PAPERBACK_PAGE_SCALE)}`,
      }
    }
    const chapterPosition =
      (chapterPositions.findIndex(
        (position) =>
          (position.locations?.progression ?? 0) >=
          (locator?.locator.locations?.progression ?? 0),
      ) ?? 0) + 1
    return {
      title: chapterTitle,
      formattedProgress: `pg. ${Math.ceil(chapterPosition / PAPERBACK_PAGE_SCALE) || 1} / ${Math.ceil(chapterPositions.length / PAPERBACK_PAGE_SCALE)}`,
    }
  }, [
    bookPrefs?.detailView?.mode,
    bookPrefs?.detailView?.scope,
    chapterPositions,
    chapterTitle,
    track.index,
    track.endPosition,
    total.trackCount,
    total.endPosition,
    rate,
    eagerProgress,
    book.title,
    book.positions,
    locator?.locator.locations?.position,
    locator?.locator.locations?.totalProgression,
    locator?.locator.locations?.progression,
  ])

  const progressStart =
    bookPrefs?.detailView?.mode === "audio"
      ? bookPrefs?.detailView?.scope === "book"
        ? total.startPosition
        : track.startPosition
      : 1

  const progressEnd =
    bookPrefs?.detailView?.mode === "audio"
      ? bookPrefs?.detailView?.scope === "book"
        ? total.endPosition
        : track.endPosition
      : bookPrefs?.detailView?.scope === "book"
        ? book.positions.length
        : chapterPositions.length

  return (
    bookPrefs && (
      <View style={styles.container}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing[2],
          }}
        >
          <ProgressBar
            style={{
              flexGrow: 1,
              // marginRight: spacing[2],
              ...(bookPrefs?.detailView?.scope === "book" ||
              Platform.OS === "android"
                ? undefined
                : { marginTop: -18, marginBottom: -18 }),
            }}
            start={progressStart}
            stop={progressEnd}
            progress={eagerProgress}
            onProgressChange={
              bookPrefs?.detailView?.scope === "book"
                ? undefined
                : (value) => {
                    setEagerProgress(value)
                    if (bookPrefs?.detailView?.mode === "audio") {
                      if (bookPrefs?.detailView?.scope === "book") {
                        dispatch(playerTotalPositionSeeked({ progress: value }))
                      } else {
                        dispatch(playerPositionSeeked({ progress: value }))
                      }
                    } else {
                      const nextLocator = chapterPositions[value - 1]
                      if (nextLocator === undefined) return
                      dispatch(
                        bookshelfSlice.actions.bookRelocated({
                          bookId: book.id,
                          locator: {
                            locator: nextLocator,
                            timestamp: Date.now(),
                          },
                        }),
                      )
                    }
                  }
            }
          />
          <Button
            chromeless
            onPress={() => {
              dispatch(previousFragmentPressed())
            }}
          >
            <Rewind color={foreground} fill={foreground} size={spacing[2.5]} />
          </Button>
          <View style={{ width: spacing[4] }}>
            <PlayPause automaticRewind={automaticRewind} />
          </View>
          <Button
            chromeless
            onPress={() => {
              dispatch(nextFragmentPressed())
            }}
          >
            <FastForward
              color={foreground}
              fill={foreground}
              size={spacing[2.5]}
            />
          </Button>
        </View>

        <View style={styles.details}>
          <Pressable
            style={{
              width: spacing[5],
            }}
            onPress={() => {
              dispatch(
                preferencesSlice.actions.bookDetailPressed({
                  bookId: book.id,
                }),
              )
            }}
          >
            <Image
              style={{
                margin: "auto",
                height: 40,
                width: bookPrefs.detailView?.mode === "audio" ? 40 : 26,
                borderRadius: 4,
              }}
              source={{
                uri:
                  bookPrefs.detailView?.mode === "audio"
                    ? getLocalAudioBookCoverUrl(book.id)
                    : getLocalBookCoverUrl(book.id),
              }}
            />
          </Pressable>
          <Pressable
            style={{
              flex: 1,
            }}
            onPress={() => {
              dispatch(
                preferencesSlice.actions.bookDetailPressed({
                  bookId: book.id,
                }),
              )
            }}
          >
            <UIText
              numberOfLines={1}
              style={{
                ...fontSizes.sm,
                fontWeight: 600,
              }}
            >
              {title}
            </UIText>
            <View
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <UIText
                numberOfLines={1}
                style={{
                  ...fontSizes.sm,
                }}
              >
                {formattedProgress}
              </UIText>
              <UIText style={fontSizes.sm}>
                {Math.round(
                  (locator?.locator.locations?.totalProgression ?? 0) * 100,
                )}
                %
              </UIText>
            </View>
          </Pressable>
        </View>
      </View>
    )
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing["1.5"],
    right: spacing["1.5"],
    bottom: spacing[4],
    zIndex: 3,
  },
  details: {
    paddingLeft: 15,
    paddingRight: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  coverAndTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cover: {
    height: 40,
    width: 40,
    borderRadius: 4,
  },
  title: {
    flex: 1,
  },
})
