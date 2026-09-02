import { type Locator } from "@readium/shared"
import { useEffect, useMemo, useState } from "react"

import { getPositionsForTocItem } from "@v3/_/components/reader/BookService"
import { formatTimeHuman } from "@v3/_/components/reader/preferenceItems/formatTime"

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
import {
  selectDetailView,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  selectCurrentLocator,
  selectCurrentToCLocator,
} from "@/store/slices/readingSessionSlice"

export type ProgressMark = {
  title: string
  position: number
  href: string
  locator: Locator | null
}

export type FormattedProgress = {
  ready: boolean
  title: string | null
  detail: string | null
  total: number
  progress: number
  marks: ProgressMark[] | null
  min: number
}

export const useFormattedProgress = ({
  book,
}: {
  book: BookWithRelations
}): FormattedProgress => {
  const detailView = useAppSelector((state) =>
    selectDetailView(state, book.uuid),
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

    if (!tocItems) {
      return null
    }

    return tocItems
      .reduce<ProgressMark[]>((acc, item) => {
        const position = item.locator?.locations.position ?? 0
        if (acc.some((mark) => mark.position === position)) {
          return acc
        }

        acc.push({
          title: item.title ?? book.title,
          position,
          href: item.locator?.href ?? "",
          locator: item.locator ?? null,
        })

        return acc
      }, [])
      .sort((a, b) => a.position - b.position)
  }, [tocItems, detailView.mode, detailView.scope, book.title])

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
      title: `Page ${position.locations.position ?? idx + 1}`,
      position: idx,
      href: position.href,
      locator: position,
    }))
  }, [chapterPositions, detailView.mode, detailView.scope])

  if (detailView.mode === "audio") {
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
        ready: playlist.length > 0 && totalDuration > 0,
        title: book.title,
        detail:
          totalDuration > 0
            ? `${formatTimeHuman(totalDuration - progressDuration)} left`
            : null,
        total: totalDuration,
        marks: audioBookMarks,
        progress: progressDuration,
        min: 0,
      }
    }

    const total = (currentTrack?.duration ?? 0) / playbackSpeed
    const progress = currentTime / playbackSpeed
    const fallbackTitle =
      playlist.length > 0 && trackIndex >= 0
        ? `Track ${trackIndex + 1} of ${playlist.length}`
        : null

    return {
      ready: currentTrack !== null && total > 0,
      title: currentTrack?.title ?? fallbackTitle,
      detail: total > 0 ? `${formatTimeHuman(total - progress)} left` : null,
      total,
      progress,
      marks: null,
      min: 0,
    }
  }

  if (detailView.scope === "book") {
    const totalPages = positions?.length ?? 0
    const currentPage =
      currentTextLocator?.locations.position ??
      Math.ceil(
        (currentTextLocator?.locations.totalProgression ?? 0) * totalPages,
      )

    return {
      ready: totalPages > 0 && currentTextLocator !== null,
      title: currentChapter?.title ?? book.title,
      detail: totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : null,
      total: totalPages,
      progress: currentPage,
      marks: textBookMarks,
      min: 0,
    }
  }

  const chapterLength = chapterPositions.length
  const currentPositionIdx = chapterPositions.findIndex(
    (position) =>
      position.locations.position === currentTextLocator?.locations.position,
  )
  const chapterProgression = currentTextLocator?.locations.progression
    ? currentTextLocator.locations.progression * chapterLength
    : Math.max(currentPositionIdx, 0)

  return {
    ready: chapterLength > 0,
    title: currentChapter?.title ?? book.title,
    detail:
      chapterLength > 0 && currentPositionIdx >= 0
        ? `Page ${currentPositionIdx + 1} of ${chapterLength}`
        : null,
    total: chapterLength,
    progress: chapterProgression,
    marks: textChapterMarks,
    min: currentChapter?.locator?.locations.position ?? 0,
  }
}
