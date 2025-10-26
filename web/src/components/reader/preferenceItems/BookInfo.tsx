import { Button, Text } from "@mantine/core"
import { type Locator } from "@readium/shared"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { cn } from "@/cn"
import {
  AudiobookCoverImage,
  EbookCoverImage,
} from "@/components/books/BookThumbnailImage"
import { getPositionsForTocItem } from "@/components/reader/BookService"
import { type BookWithRelations } from "@/database/books"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  getPositions,
  getPublication,
  getTocItems,
} from "@/store/readerRegistry"
import {
  selectCurrentTime,
  selectCurrentTrack,
  selectPlaylist,
} from "@/store/slices/audioPlayerSlice"
import {
  preferencesSlice,
  selectDetailView,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  selectCurrentLocator,
  selectCurrentToCLocator,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { formatTimeHuman } from "./formatTime"

export const BookInfo = ({
  book,
  context,
  imageDimensions,
}: {
  book: BookWithRelations
  context: "mini-player" | "reader-footer" | "reader-header"
  imageDimensions?: {
    audio?: {
      height: string
      width: string
    }
    text?: {
      height: string
      width: string
    }
  }
}) => {
  const detailView = useAppSelector((state) =>
    selectDetailView(state, book.uuid),
  )
  const { formattedProgress, title } = useFormattedProgress({ book })
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectReadingMode)

  return (
    <>
      <Button
        variant="subtle"
        size="sm"
        className="border-none bg-transparent p-0 hover:bg-transparent"
        onClick={() =>
          dispatch(
            preferencesSlice.actions.toggleBookDetailView({
              target: book.uuid,
              mode,
            }),
          )
        }
      >
        {detailView.mode === "audio" ? (
          <AudiobookCoverImage
            book={book}
            height={imageDimensions?.audio?.height ?? "2.5rem"}
            width={imageDimensions?.audio?.width ?? "2.5rem"}
          />
        ) : (
          <EbookCoverImage
            book={book}
            height={imageDimensions?.text?.height ?? "2.5rem"}
            width={imageDimensions?.text?.width ?? "1.5rem"}
          />
        )}
      </Button>
      <div
        className={cn(context === "mini-player" ? "text-center" : "text-left")}
      >
        <Text
          size="sm"
          className="text-reader-text line-clamp-1 font-medium md:max-w-96"
        >
          {detailView.scope === "book" ? (
            <Link
              href={`/books/${book.uuid}`}
              className="hover:text-reader-accent hover:underline"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </Text>
        <Text size="xs" className="text-reader-text-muted">
          {formattedProgress}
        </Text>
      </div>
    </>
  )
}

export const MiniPlayerBookInfo = ({ book }: { book: BookWithRelations }) => {
  const { title } = useFormattedProgress({ book })

  return (
    <div>
      <Text
        size="sm"
        className="text-reader-text line-clamp-1 font-medium md:max-w-96"
      >
        <Link
          href={`/books/${book.uuid}`}
          className="hover:text-reader-accent hover:underline"
        >
          {title}
        </Link>
      </Text>
      {/* <Text size="xs" className="text-reader-text-muted">
        {formattedProgress}
      </Text> */}
    </div>
  )
}

export const useFormattedProgress = ({ book }: { book: BookWithRelations }) => {
  const detailView = useAppSelector((state) =>
    selectPreference(state, "detailView"),
  )
  const playbackSpeed = useAppSelector((state) =>
    selectPreference(state, "playbackSpeed"),
  )
  const currentChapter = useAppSelector(selectCurrentToCLocator)
  const positions = getPositions()
  const tocItems = getTocItems()
  const currentTextLocator = useAppSelector(selectCurrentLocator)
  const currentTrack = useAppSelector(selectCurrentTrack)
  const currentTime = useAppSelector(selectCurrentTime)
  const playlist = useAppSelector(selectPlaylist)

  const trackIndex = playlist.findIndex(
    (track) => track.url === currentTrack?.url,
  )

  const audioBookMarks = useMemo(() => {
    if (detailView.mode !== "audio" || detailView.scope !== "book") {
      return null
    }

    let runningTotal = 0
    return playlist
      .map((track, idx) => {
        const mark = {
          title: track.title || `Track ${idx + 1}`,
          position: runningTotal,
          href: track.url,
          locator: track.tocItem?.locator ?? null,
        }
        runningTotal += (track.duration ?? 0) / playbackSpeed
        return mark
      })
      .sort((a, b) => a.position - b.position)
  }, [playlist, playbackSpeed, detailView.mode, detailView.scope])

  const textBookMarks = useMemo(() => {
    if (detailView.mode === "audio" || detailView.scope !== "book") {
      return null
    }

    return (
      tocItems?.reduce(
        (acc, item) => {
          const position = item.locator?.locations.position ?? 0
          const existing = acc.find((mark) => mark.position === position)

          if (existing) {
            return acc
          }

          acc.push({
            title: item.title ?? "Unknown Chapter",
            position,
            href: item.locator?.href ?? "",
            locator: item.locator ?? null,
          })

          return acc
        },
        [] as Array<{
          title: string
          position: number
          href: string
          locator: Locator | null
        }>,
      ) ?? null
    )?.sort((a, b) => a.position - b.position)
  }, [tocItems, detailView.mode, detailView.scope])

  const [chapterPositions, setChapterPositions] = useState<Locator[]>([])

  useEffect(() => {
    if (detailView.mode === "audio" || detailView.scope === "book") {
      setChapterPositions([])
      return
    }

    if (!currentChapter || !positions || !tocItems) {
      setChapterPositions([])
      return
    }

    const publication = getPublication()
    if (!publication) {
      setChapterPositions([])
      return
    }

    void getPositionsForTocItem(
      currentChapter,
      tocItems,
      positions,
      publication,
    ).then(setChapterPositions)
  }, [positions, currentChapter, tocItems, detailView.mode, detailView.scope])

  const textChapterMarks = useMemo(() => {
    if (detailView.mode === "audio" || detailView.scope === "book") {
      return null
    }

    return chapterPositions.map((position, idx) => ({
      title: `pg. ${position.locations.position}`,
      position: idx,
      href: position.href,
      locator: position,
    }))
  }, [chapterPositions, detailView.mode, detailView.scope])

  if (detailView.mode === "audio") {
    // audio - total
    if (detailView.scope === "book") {
      let totalDuration = 0
      let progressDuration = 0

      for (let idx = 0; idx < playlist.length; idx++) {
        const track = playlist[idx]
        if (!track) continue

        const duration = (track.duration ?? 0) / playbackSpeed

        if (idx < trackIndex) {
          progressDuration += duration
        }
        if (idx === trackIndex) {
          progressDuration += currentTime / playbackSpeed
        }
        totalDuration += duration
      }

      return {
        title: book.title,
        formattedProgress: `${formatTimeHuman(totalDuration - progressDuration)} left`,
        total: totalDuration,
        marks: audioBookMarks,
        progress: progressDuration,
        min: 0,
      }
    }

    // audio - track
    const total = (currentTrack?.duration ?? 0) / playbackSpeed
    const progress = currentTime / playbackSpeed

    return {
      title:
        currentTrack?.title ??
        (playlist.length > 0 && trackIndex
          ? `Track ${trackIndex + 1} of ${playlist.length}`
          : "Unknown Track"),
      formattedProgress: `${formatTimeHuman(total - progress)} left`,
      total,
      progress,
      marks: null,
      min: 0,
    }
  }

  // text - book
  if (detailView.scope === "book") {
    const totalPages = positions?.length ?? 0
    const progression = Math.ceil(
      (currentTextLocator?.locations.totalProgression ?? 1) * totalPages,
    )

    return {
      title: book.title,
      formattedProgress: `pg. ${progression}  ${totalPages ? `/ ${totalPages}` : ""}`,
      total: totalPages,
      progress: progression,
      marks: textBookMarks,
      min: 0,
    }
  }

  // text - chapter
  const chapterLength = chapterPositions.length

  const currentPositionIdx = chapterPositions.findIndex(
    (position) =>
      position.locations.position === currentTextLocator?.locations.position,
  )
  const currentPosition =
    chapterPositions[currentPositionIdx]?.locations.position

  const currentPage = currentPositionIdx + 1

  const chapterProgression = currentTextLocator?.locations.progression
    ? currentTextLocator.locations.progression * chapterLength
    : currentPositionIdx

  return {
    title: currentChapter?.title ?? "Unknown Chapter",
    formattedProgress: `pg. ${currentPosition ?? ""}  (${currentPage} of ${chapterLength})`,
    total: chapterLength,
    progress: chapterProgression,
    marks: textChapterMarks,
    min: currentChapter?.locator?.locations.position ?? 0,
  }
}
