import { Image, Pressable, StyleSheet, View } from "react-native"
import {
  getLocalAudioBookCoverUrl,
  getLocalBookCoverUrl,
} from "../store/persistence/files"
import { ProgressBar } from "./ProgressBar"
import { PlayPause } from "./PlayPause"
import {
  BookshelfBook,
  bookshelfSlice,
  playerPositionSeeked,
  playerTotalPositionSeeked,
} from "../store/slices/bookshelfSlice"
import { UIText } from "./UIText"
import { useState, useMemo, useEffect, useRef } from "react"
import { useAudioBook, formatTime } from "../hooks/useAudioBook"
import { isSameChapter } from "../links"
import { useAppSelector, useAppDispatch } from "../store/appState"
import { getLocator } from "../store/selectors/bookshelfSelectors"
import { getBookPreferences } from "../store/selectors/preferencesSelectors"
import { spacing } from "./ui/tokens/spacing"
import { preferencesSlice } from "../store/slices/preferencesSlice"
import { fontSizes } from "./ui/tokens/fontSizes"

export function debounce<A extends unknown[]>(
  func: (...args: A) => void,
  wait?: number,
  leading?: boolean,
): ((...args: A) => void) & {
  cancel: () => void
} {
  let timeout: NodeJS.Timeout | null
  let isCancelled = false

  function debounced(this: unknown, ...args: A): void {
    isCancelled = false
    if (leading && !timeout) {
      func.apply(this, args)
    }
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      timeout = null
      if (!(leading || isCancelled)) {
        func.apply(this, args)
      }
      isCancelled = false
    }, wait)
  }

  debounced.cancel = () => {
    isCancelled = true
  }

  return debounced
}

type Props = {
  book: BookshelfBook
}

export function MiniPlayer({ book }: Props) {
  const locator = useAppSelector((state) => getLocator(state, book.id))
  const bookPrefs = useAppSelector((state) =>
    getBookPreferences(state, book.id),
  )
  const { isPlaying, isLoading, track, total } = useAudioBook()

  const dispatch = useAppDispatch()
  const [eagerProgress, setEagerProgress] = useState(track.position)

  const syncEagerProgress = useMemo(() => {
    return debounce(() => {
      setEagerProgress(positionRef.current)
    }, 200)
  }, [])

  useEffect(() => {
    syncEagerProgress()
    return () => {
      syncEagerProgress.cancel()
    }
  }, [total.position, track.position, locator, syncEagerProgress])

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

  const formattedEagerProgress = useMemo(() => {
    return formatTime(eagerProgress)
  }, [eagerProgress])

  const { title, formattedProgress } = useMemo(() => {
    if (bookPrefs?.detailView?.mode === "audio") {
      if (bookPrefs.detailView.scope === "book") {
        return {
          title: book.title,
          formattedProgress: `${formattedEagerProgress} / ${total.formattedEndPosition}`,
        }
      }
      return {
        title: `Track ${track.index} of ${total.trackCount}`,
        formattedProgress: `${formattedEagerProgress} / ${track.formattedEndPosition}`,
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
        formattedProgress: `pg. ${position} / ${book.positions.length}`,
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
      formattedProgress: `pg. ${chapterPosition} / ${chapterPositions.length}`,
    }
  }, [
    bookPrefs?.detailView?.mode,
    bookPrefs?.detailView?.scope,
    locator?.locator.locations?.position,
    locator?.locator.locations?.totalProgression,
    locator?.locator.locations?.progression,
    chapterTitle,
    total.formattedEndPosition,
    total.trackCount,
    track.index,
    track.formattedEndPosition,
    formattedEagerProgress,
    book.title,
    book.positions,
    chapterPositions,
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
        <ProgressBar
          style={
            bookPrefs?.detailView?.scope === "book"
              ? undefined
              : { marginTop: -18, marginBottom: -18 }
          }
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

        <View style={styles.details}>
          <Pressable
            style={{
              width: spacing[5],
            }}
            onPress={() => {
              dispatch(
                preferencesSlice.actions.bookDetailImagePressed({
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
                preferencesSlice.actions.bookDetailPositionPressed({
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
            <UIText
              numberOfLines={1}
              style={{
                ...fontSizes.sm,
              }}
            >
              {formattedProgress}
            </UIText>
          </Pressable>
          <PlayPause isPlaying={isPlaying} isLoading={isLoading} />
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
    paddingVertical: 15,
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
