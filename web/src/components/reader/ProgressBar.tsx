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

type HoverLabelProps = {
  trackRef: React.RefObject<HTMLDivElement | null>
  hoverValue: number
  max: number
  formatLabel: (value: number) => string
  context?: "pip" | undefined
  pipWindow?: PictureInPictureWindow | null
}

const HoverLabel = ({
  trackRef,
  hoverValue,
  max,
  formatLabel,
  context,
  pipWindow,
}: HoverLabelProps) => {
  if (!trackRef.current) return null

  const rect = trackRef.current.getBoundingClientRect()
  const percentage = max > 0 ? hoverValue / max : 0
  const leftPosition = rect.left + rect.width * percentage
  const topPosition = rect.top - 48 // -12 * 4px (tailwind spacing)
  const targetDocument =
    context === "pip" && pipWindow ? pipWindow.document : document

  return createPortal(
    <div
      className="bg-reader-surface-hover text-reader-text pointer-events-none fixed z-[500] -translate-x-1/2 rounded-md p-2 font-medium"
      style={{
        left: `${leftPosition}px`,
        top: `${topPosition}px`,
      }}
    >
      {formatLabel(hoverValue)}
    </div>,
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

  const handleTrackMouseLeave = useCallback(() => {
    setHoverValue(null)
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

  const MarkList = useMemo(() => {
    if (!marks || marks.length === 0) return null
    return (
      <div className="pointer-events-none absolute inset-0">
        {marks.map((mark, idx) => {
          const markPercentage = max > 0 ? (mark.position / max) * 100 : 0
          return (
            <div
              key={idx}
              className="group/mark bg-reader-bg/70 border-reader-accent/70 hover:bg-reader-accent-hover pointer-events-auto absolute top-0 z-[500] h-1 w-1 -translate-x-1/2 cursor-pointer rounded-full border opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
              style={{ left: `${markPercentage}%` }}
              onClick={() => {
                handleMarkClick(mark.position)
              }}
            >
              {/* mark tooltip */}
              <div className="bg-reader-surface-hover text-reader-text absolute -top-12 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-md p-2 font-medium opacity-0 transition-opacity group-hover/mark:opacity-100">
                {mark.title}
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [marks, max, handleMarkClick])

  return (
    <div className="relative h-1">
      {/* track */}
      <div
        ref={trackRef}
        className="bg-reader-surface-hover group relative h-1 cursor-pointer"
        onMouseDown={(e) => {
          handleMouseOrTouchDown(e.nativeEvent)
        }}
        onTouchStart={(e) => {
          handleMouseOrTouchDown(e.nativeEvent)
        }}
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

        {/* thumb */}
        {!restrictToMarks && (
          <div
            className="border-reader-accent bg-reader-accent absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `${percentage}%` }}
          />
        )}

        {/* hover label for free sliding */}
        {!restrictToMarks &&
          showLabel &&
          formatLabel &&
          hoverValue !== null && (
            <HoverLabel
              trackRef={trackRef}
              hoverValue={hoverValue}
              max={max}
              formatLabel={formatLabel}
              context={context}
              pipWindow={pipWindow}
            />
          )}
      </div>

      {/* marks */}
      {MarkList}
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
