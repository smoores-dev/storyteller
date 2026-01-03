import { FastForward, Rewind } from "lucide-react-native"
import { useMemo, useRef } from "react"
import { View } from "react-native"

import { type BookWithRelations } from "@/database/books"
import { formatTimeHuman, useAudioBook } from "@/hooks/useAudioBook"
import { cn } from "@/lib/utils"
import { getHrefChapterTitle, positionToPageCount } from "@/links"
import {
  bookDetailPressed,
  miniPlayerSliderChapterPositionChanged,
  nextFragmentPressed,
  playerPositionSeeked,
  playerTotalPositionSeeked,
  previousFragmentPressed,
} from "@/store/actions"
import { useAppDispatch } from "@/store/appState"
import { useGetBookPreferencesQuery } from "@/store/localApi"

import { AudiobookCover } from "./AudiobookCover"
import { EbookCover } from "./EbookCover"
import { PlayPause } from "./PlayPause"
import { ProgressBar } from "./ProgressBar"
import { HideableView } from "./ui/HideableView"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"
import { Text } from "./ui/text"

type Props = {
  book: BookWithRelations
  format: "ebook" | "readaloud"
  automaticRewind: boolean
  hidden: boolean
}

export function MiniPlayer({ book, format, hidden, automaticRewind }: Props) {
  const locator = book.position?.locator
  const { data: bookPrefs } = useGetBookPreferencesQuery({ uuid: book.uuid })
  const { track, total, rate } = useAudioBook()
  const trackPositionRef = useRef(track.position)
  trackPositionRef.current = track.position

  const dispatch = useAppDispatch()

  const manifest =
    format === "readaloud" ? book.readaloud?.epubManifest : book.ebook?.manifest
  const positions = book[format]?.positions

  const chapterTitle = useMemo(() => {
    if (!manifest?.toc) return null
    if (!locator?.href) return null

    return getHrefChapterTitle(locator.href, manifest.toc)
  }, [manifest?.toc, locator?.href])

  const chapterPositions = useMemo(() => {
    return (
      positions?.filter((position) => position.href === locator?.href) ?? []
    )
  }, [positions, locator?.href])

  const progress = useMemo(() => {
    if (bookPrefs?.detailView?.mode === "audio") {
      if (bookPrefs?.detailView?.scope === "book") {
        return total.position
      }
      return track.position
    }
    if (bookPrefs?.detailView?.scope === "book") {
      const position =
        locator?.locations?.position ??
        positions?.findIndex(
          (position) =>
            (position.locations?.totalProgression ?? 0) >=
            (locator?.locations?.totalProgression ?? 0),
        ) ??
        0

      return position === -1 ? positions?.length ?? 1 : position + 1
    }
    const chapterPosition =
      chapterPositions.findIndex(
        (position) =>
          (position.locations?.progression ?? 0) >=
          (locator?.locations?.progression ?? 0),
      ) ?? 0

    return chapterPosition === -1
      ? chapterPositions.length ?? 1
      : chapterPosition + 1
  }, [
    positions,
    bookPrefs?.detailView?.mode,
    bookPrefs?.detailView?.scope,
    chapterPositions,
    locator?.locations?.position,
    locator?.locations?.progression,
    locator?.locations?.totalProgression,
    total.position,
    track.position,
  ])

  const { title, formattedProgress } = useMemo(() => {
    if (bookPrefs?.detailView?.mode === "audio") {
      if (bookPrefs.detailView.scope === "book") {
        return {
          title: book.title,
          formattedProgress: `${formatTimeHuman(
            total.endPosition / rate - progress / rate,
          )} left`,
        }
      }
      return {
        title: `Track ${track.index + 1} of ${total.trackCount}`,
        formattedProgress: `${formatTimeHuman(
          track.endPosition / rate - progress / rate,
        )} left`,
      }
    }
    if (bookPrefs?.detailView?.scope === "book") {
      const position =
        locator?.locations?.position ??
        (positions?.findIndex(
          (position) =>
            (position.locations?.totalProgression ?? 0) >=
            (locator?.locations?.totalProgression ?? 0),
        ) ?? 0) + 1
      return {
        title: book.title,
        formattedProgress: `pg. ${positionToPageCount(position) || 1} / ${positionToPageCount(positions?.length ?? 0)}`,
      }
    }
    const chapterPosition = chapterPositions.findIndex(
      (position) =>
        (position.locations?.progression ?? 0) >=
        (locator?.locations?.progression ?? 0),
    )

    return {
      title: chapterTitle,
      formattedProgress: `pg. ${positionToPageCount(chapterPosition === -1 ? chapterPositions.length : chapterPosition + 1) || 1} / ${positionToPageCount(chapterPositions.length)}`,
    }
  }, [
    bookPrefs?.detailView?.mode,
    bookPrefs?.detailView?.scope,
    chapterPositions,
    chapterTitle,
    progress,
    track.index,
    track.endPosition,
    total.trackCount,
    total.endPosition,
    rate,
    book.title,
    positions,
    locator?.locations?.position,
    locator?.locations?.totalProgression,
    locator?.locations?.progression,
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
        ? positions?.length
        : chapterPositions.length

  return (
    bookPrefs && (
      <View>
        <HideableView hidden={hidden} className="mb-safe-or-2 z-3 px-3 pb-2">
          <View className="flex-row items-center gap-0">
            <ProgressBar
              className="my-6 grow"
              start={progressStart}
              stop={progressEnd ?? 0}
              progress={progress}
              onProgressChange={
                bookPrefs?.detailView?.scope === "book"
                  ? undefined
                  : (value) => {
                      if (bookPrefs?.detailView?.mode === "audio") {
                        if (bookPrefs?.detailView?.scope === "book") {
                          dispatch(
                            playerTotalPositionSeeked({ progress: value }),
                          )
                        } else {
                          dispatch(playerPositionSeeked({ progress: value }))
                        }
                      } else {
                        const nextLocator = chapterPositions[value - 1]
                        if (nextLocator === undefined) return
                        dispatch(
                          miniPlayerSliderChapterPositionChanged({
                            bookUuid: book.uuid,
                            locator: nextLocator,
                            timestamp: Date.now(),
                          }),
                        )
                      }
                    }
              }
            />
            {format !== "ebook" && (
              <>
                <Button
                  variant="ghost"
                  onPress={() => {
                    dispatch(previousFragmentPressed())
                  }}
                >
                  <Icon as={Rewind} size={20} />
                </Button>
                <View className="w-8">
                  <PlayPause automaticRewind={automaticRewind} />
                </View>
                <Button
                  variant="ghost"
                  onPress={() => {
                    dispatch(nextFragmentPressed())
                  }}
                >
                  <Icon as={FastForward} size={20} />
                </Button>
              </>
            )}
          </View>

          <View className="flex-row items-center justify-between gap-3 pr-8 pl-[15px]">
            <Button
              variant="ghost"
              className="w-10 p-0"
              onPress={() => {
                dispatch(bookDetailPressed({ bookUuid: book.uuid, format }))
              }}
            >
              <View
                className={cn(
                  "m-auto h-10 overflow-hidden rounded-sm",
                  bookPrefs.detailView?.mode === "audio" ? "w-10" : "w-[26px]",
                )}
              >
                {bookPrefs.detailView?.mode === "audio" ? (
                  <AudiobookCover book={book} />
                ) : (
                  <EbookCover book={book} />
                )}
              </View>
            </Button>
            <Button
              variant="ghost"
              className="flex-1 flex-col items-stretch"
              onPress={() => {
                dispatch(bookDetailPressed({ bookUuid: book.uuid, format }))
              }}
            >
              <Text
                maxFontSizeMultiplier={1.25}
                numberOfLines={1}
                className="text-sm font-semibold"
              >
                {title}
              </Text>
              <View className="grow flex-row justify-between">
                <Text
                  maxFontSizeMultiplier={1.25}
                  numberOfLines={1}
                  className="text-sm"
                >
                  {formattedProgress}
                </Text>
                <Text maxFontSizeMultiplier={1.25} className="text-sm">
                  {Math.round(
                    (locator?.locations?.totalProgression ?? 0) * 100,
                  )}
                  %
                </Text>
              </View>
            </Button>
          </View>
        </HideableView>
      </View>
    )
  )
}
