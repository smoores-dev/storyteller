import { type Locator } from "@readium/shared"
import { useEffect, useMemo, useState } from "react"

import { type BookWithRelations } from "@/database/books"
import { useAppSelector } from "@/store/appState"
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
import { selectPreference } from "@/store/slices/preferencesSlice"
import {
  selectCurrentLocator,
  selectCurrentToCLocator,
} from "@/store/slices/readingSessionSlice"

import { getPositionsForTocItem } from "../BookService"
import { formatTimeHuman } from "../preferenceItems/formatTime"

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
