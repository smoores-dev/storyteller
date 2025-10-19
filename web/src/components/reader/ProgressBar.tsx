import { useThrottledCallback } from "@mantine/hooks"
import { type Locator } from "@readium/shared"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import {
  playerPositionSeeked,
  playerTrackChanged,
  userRequestedTextNavigation,
} from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectPlaybackRate } from "@/store/slices/audioPlayerSlice"
import { type ReadingPreferences } from "@/store/slices/preferencesSlice"

import { usePiPWindow } from "./PipProvider"
import { getClientXY } from "./hooks/mouseHelpers"
import { useFormattedProgress } from "./preferenceItems/BookInfo"
import { formatTime } from "./preferenceItems/formatTime"

const getCorrespondingMark = (
  marks:
    | {
        title: string
        position: number
        href: string
        locator: Locator | null
      }[]
    | null,
  value: number,
) => {
  return marks?.findLast((mark) => value >= mark.position)
}

type TooltipProps = {
  elementRef: React.RefObject<HTMLElement | null>
  content: string
  context?: "pip" | undefined
  pipWindow?: PictureInPictureWindow | null
  // for track-based positioning (hover label)
  trackBased?:
    | {
        value: number
        max: number
      }
    | undefined
}

const Tooltip = ({
  elementRef,
  content,
  context,
  pipWindow,
  trackBased,
}: TooltipProps) => {
  if (!elementRef.current) return null

  const rect = elementRef.current.getBoundingClientRect()
  const targetDocument =
    context === "pip" && pipWindow ? pipWindow.document : document

  const leftPosition = trackBased
    ? rect.left +
      rect.width * (trackBased.max > 0 ? trackBased.value / trackBased.max : 0)
    : rect.left + rect.width / 2

  // check if there's enough space at the top (48px for tooltip + some margin)
  const hasSpaceAbove = rect.top > 60
  const topPosition = hasSpaceAbove
    ? rect.top - 48 // -12 * 4px
    : rect.bottom + 12 // +3 * 4px

  return createPortal(
    <div
      className="bg-reader-surface-hover text-reader-text pointer-events-none fixed z-[500] -translate-x-1/2 whitespace-nowrap rounded-md p-2 font-medium"
      style={{
        left: `${leftPosition}px`,
        top: `${topPosition}px`,
      }}
    >
      {content}
    </div>,
    targetDocument.body,
  )
}

type ThumbProps = {
  trackRef: React.RefObject<HTMLDivElement | null>
  percentage: number
  context?: "pip" | undefined
  pipWindow?: PictureInPictureWindow | null
}

const Thumb = ({ trackRef, percentage, context, pipWindow }: ThumbProps) => {
  if (!trackRef.current) return null

  const rect = trackRef.current.getBoundingClientRect()
  const targetDocument =
    context === "pip" && pipWindow ? pipWindow.document : document

  const leftPosition = rect.left + rect.width * (percentage / 100)
  const topPosition = rect.top + rect.height / 2

  return createPortal(
    <div
      className="border-reader-accent bg-reader-accent pointer-events-none fixed z-[500] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
      style={{
        left: `${leftPosition}px`,
        top: `${topPosition}px`,
      }}
    />,
    targetDocument.body,
  )
}

type CustomSliderProps = {
  context?: "pip" | undefined
  value: number
  min: number
  max: number
  marks: { position: number; title: string }[] | null
  restrictToMarks: boolean
  onChange: (value: number) => void
  onChangeEnd: (value: number) => void
  showLabel: boolean
  formatLabel?: ((value: number) => string) | undefined
}

// @mantine/core/Slider is extremely innefficient, especially when used with marks
// to the point of introducing noticeable lag when switching between fragments
// hence this custom implementation
const CustomSlider = ({
  value,
  min,
  max,
  marks,
  restrictToMarks,
  onChange,
  onChangeEnd,
  showLabel,
  formatLabel,
  context,
}: CustomSliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const [hoveredMarkIndex, setHoveredMarkIndex] = useState<number | null>(null)
  const [isTrackHovered, setIsTrackHovered] = useState(false)
  const markRefs = useRef<(HTMLButtonElement | null)[]>([])

  const percentage = max > 0 ? ((value - min) / (max - min)) * 100 : 0

  const getValueFromEvent = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return value

      const rect = trackRef.current.getBoundingClientRect()
      const position = (clientX - rect.left) / rect.width
      const newValue = Math.max(0, Math.min(max, position * max))

      if (restrictToMarks && marks && marks.length > 0) {
        // find closest mark
        const closest = marks.reduce((prev, curr) =>
          Math.abs(curr.position - newValue) <
          Math.abs(prev.position - newValue)
            ? curr
            : prev,
        )
        return closest.position
      }

      return newValue
    },
    [max, marks, restrictToMarks, value],
  )

  const { pipWindow } = usePiPWindow()

  const handleMouseOrTouchDown = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (restrictToMarks && marks && marks.length > 0) {
        return
      }

      const [clientX] = getClientXY(e)
      if (clientX === undefined) return

      const newValue = getValueFromEvent(clientX)
      setIsDragging(true)
      onChange(newValue)
    },
    [restrictToMarks, marks, getValueFromEvent, onChange],
  )

  const handleMouseOrTouchMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      const [clientX] = getClientXY(e)
      if (clientX === undefined) return

      const newValue = getValueFromEvent(clientX)
      onChange(newValue)
      setHoverValue(newValue)
    },
    [getValueFromEvent, isDragging, onChange],
  )

  const handleMouseorTouchUp = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      const [clientX] = getClientXY(e)
      if (clientX === undefined) return

      const newValue = getValueFromEvent(clientX)
      onChangeEnd(newValue)
      setIsDragging(false)
      setHoverValue(null)
    },
    [getValueFromEvent, isDragging, onChangeEnd],
  )

  const handleTrackMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging && showLabel && formatLabel) {
        const newValue = getValueFromEvent(e.clientX)
        setHoverValue(newValue)
      }
    },
    [formatLabel, getValueFromEvent, isDragging, showLabel],
  )

  const handleTrackMouseEnter = useCallback(() => {
    setIsTrackHovered(true)
  }, [])

  const handleTrackMouseLeave = useCallback(() => {
    setHoverValue(null)
    setIsTrackHovered(false)
  }, [])

  const handleMarkClick = useCallback(
    (position: number) => {
      onChange(position)
      onChangeEnd(position)
    },
    [onChange, onChangeEnd],
  )

  useEffect(() => {
    const document =
      context === "pip" && pipWindow ? pipWindow.document : window.document

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseOrTouchMove)
      document.addEventListener("touchmove", handleMouseOrTouchMove)
      document.addEventListener("mouseup", handleMouseorTouchUp)
      document.addEventListener("touchend", handleMouseorTouchUp)
      document.addEventListener("touchcancel", handleMouseorTouchUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseOrTouchMove)
        document.removeEventListener("touchmove", handleMouseOrTouchMove)
        document.removeEventListener("mouseup", handleMouseorTouchUp)
        document.removeEventListener("touchend", handleMouseorTouchUp)
      }
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseOrTouchMove)
      document.removeEventListener("touchmove", handleMouseOrTouchMove)
      document.removeEventListener("mouseup", handleMouseorTouchUp)
      document.removeEventListener("touchend", handleMouseorTouchUp)
    }
  }, [
    context,
    handleMouseOrTouchMove,
    handleMouseorTouchUp,
    isDragging,
    pipWindow,
  ])

  // initialize markRefs array when marks change
  useEffect(() => {
    if (marks) {
      markRefs.current = markRefs.current.slice(0, marks.length)
    }
  }, [marks])

  const MarkList = useMemo(() => {
    if (!marks || marks.length === 0) return null
    return (
      <div className="pointer-events-none absolute inset-0">
        {marks.map((mark, idx) => {
          const markPercentage = max > 0 ? (mark.position / max) * 100 : 0
          return (
            <button
              key={idx}
              ref={(el) => {
                markRefs.current[idx] = el
              }}
              className="bg-reader-bg/70 border-reader-accent/70 hover:bg-reader-accent-hover pointer-events-auto absolute top-0 z-[500] h-1 w-1 -translate-x-1/2 cursor-pointer rounded-full border opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
              style={{ left: `${markPercentage}%` }}
              onClick={() => {
                handleMarkClick(mark.position)
              }}
              onMouseEnter={() => {
                setHoveredMarkIndex(idx)
              }}
              onMouseLeave={() => {
                setHoveredMarkIndex(null)
              }}
              onFocus={() => {
                setHoveredMarkIndex(idx)
              }}
              onBlur={() => {
                setHoveredMarkIndex(null)
              }}
              aria-label={mark.title}
            />
          )
        })}
      </div>
    )
  }, [marks, max, handleMarkClick])

  return (
    <div className="group relative h-1">
      {/* track */}
      <div
        ref={trackRef}
        className="bg-reader-surface-hover relative h-1 cursor-pointer"
        onMouseDown={(e) => {
          handleMouseOrTouchDown(e.nativeEvent)
        }}
        onTouchStart={(e) => {
          handleMouseOrTouchDown(e.nativeEvent)
        }}
        onMouseEnter={handleTrackMouseEnter}
        onMouseMove={(e) => {
          handleTrackMouseMove(e.nativeEvent)
        }}
        onMouseLeave={handleTrackMouseLeave}
      >
        {/* progress bar */}
        <div
          className={cn(
            "bg-reader-accent absolute left-0 top-0 h-1 transition-all",
            isDragging ? "duration-0" : "duration-300",
          )}
          style={{ width: `${percentage}%` }}
        />

        {/* hover label for free sliding */}
        {!restrictToMarks &&
          showLabel &&
          formatLabel &&
          hoverValue !== null && (
            <Tooltip
              elementRef={trackRef}
              content={formatLabel(hoverValue)}
              context={context}
              pipWindow={pipWindow}
              trackBased={{ value: hoverValue, max }}
            />
          )}
      </div>

      {/* marks */}
      {MarkList}

      {/* thumb portal */}
      {!restrictToMarks && isTrackHovered && trackRef.current && (
        <Thumb
          trackRef={trackRef}
          percentage={percentage}
          context={context}
          pipWindow={pipWindow}
        />
      )}

      {/* mark tooltip portal */}
      {hoveredMarkIndex !== null &&
        marks &&
        marks[hoveredMarkIndex] &&
        markRefs.current[hoveredMarkIndex] && (
          <Tooltip
            elementRef={{
              current: markRefs.current[hoveredMarkIndex],
            }}
            content={marks[hoveredMarkIndex].title}
            context={context}
            pipWindow={pipWindow}
          />
        )}
    </div>
  )
}

export const ProgressBar = ({
  book,
  detailView,
  context,
}: {
  book: BookWithRelations
  detailView: ReadingPreferences["detailView"]
  context?: "pip" | undefined
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const { total, marks, progress } = useFormattedProgress({ book })

  const [sliderValue, setSliderValue] = useState(progress)
  const playbackSpeed = useAppSelector(selectPlaybackRate)

  const dispatch = useAppDispatch()

  const updateSliderFromProgress = useThrottledCallback(
    (newProgress: number) => {
      if (!isDragging) {
        setSliderValue(newProgress)
      }
    },
    200,
  )

  // update slider when progress changes, but debounced
  useEffect(() => {
    updateSliderFromProgress(progress)
  }, [progress, updateSliderFromProgress])

  const handleChange = useCallback((value: number) => {
    setIsDragging(true)
    setSliderValue(value)
  }, [])

  const handleChangeEnd = useCallback(
    (value: number) => {
      if (detailView.mode === "text") {
        const locator = getCorrespondingMark(marks, value)?.locator
        if (locator) {
          dispatch(userRequestedTextNavigation({ locator }))
        }
        setTimeout(() => {
          setIsDragging(false)
        }, 300)
        return
      }

      if (detailView.scope === "chapter") {
        dispatch(playerPositionSeeked({ progress: value * playbackSpeed }))
        setTimeout(() => {
          setIsDragging(false)
        }, 300)

        return
      }
      const mark = marks?.findIndex((mark) => mark.position === value)
      if (mark == null) return

      dispatch(playerTrackChanged({ index: mark, start: 0 }))
      setTimeout(() => {
        setIsDragging(false)
      }, 300)
    },
    [detailView.mode, detailView.scope, dispatch, marks, playbackSpeed],
  )

  const restrictToMarks =
    detailView.scope === "book" || detailView.mode === "text"

  const formattedMarks =
    marks && marks.length > 0
      ? marks.map((mark) => ({
          position: mark.position,
          title: mark.title,
        }))
      : null

  const shouldShowLabel =
    detailView.scope === "chapter" && detailView.mode === "audio"

  return (
    <CustomSlider
      value={sliderValue}
      max={total}
      min={0}
      marks={formattedMarks}
      restrictToMarks={restrictToMarks}
      onChange={handleChange}
      onChangeEnd={handleChangeEnd}
      showLabel={shouldShowLabel}
      formatLabel={shouldShowLabel ? formatTime : undefined}
      context={context}
    />
  )
}
