import { useThrottledCallback } from "@mantine/hooks"
import { type Locator } from "@readium/shared"
import { useCallback, useEffect, useRef, useState } from "react"
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

import { getClientXY } from "./hooks/mouseHelpers"
import { useFormattedProgress } from "./hooks/useFormattedProgress"
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
  targetDocument?: Document
  children: React.ReactNode
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
  trackBased,
  children,
  targetDocument = window.document,
}: TooltipProps) => {
  if (!elementRef.current) return null

  const rect = elementRef.current.getBoundingClientRect()

  const leftPosition = trackBased
    ? rect.left +
      rect.width * (trackBased.max > 0 ? trackBased.value / trackBased.max : 0)
    : rect.left + rect.width / 2

  // the bottom of the tooltip should be the top of the element + 4px
  const hasSpaceAbove = rect.top > 60

  const innerHeight = targetDocument.documentElement.clientHeight

  const bottomPosition = hasSpaceAbove
    ? innerHeight - rect.top + 4
    : rect.bottom + 4

  return createPortal(
    <div
      className="bg-reader-surface text-reader-text pointer-events-none fixed z-500 -translate-x-1/2 rounded-md font-medium whitespace-nowrap"
      style={{
        left: `${leftPosition}px`,
        bottom: `${bottomPosition}px`,
      }}
    >
      {children}
    </div>,
    targetDocument.body,
  )
}

type ThumbProps = {
  trackRef: React.RefObject<HTMLDivElement | null>
  percentage: number
  targetDocument?: Document
}

const Thumb = ({
  trackRef,
  percentage,
  targetDocument = window.document,
}: ThumbProps) => {
  if (!trackRef.current) return null

  const rect = trackRef.current.getBoundingClientRect()
  const leftPosition = rect.left + rect.width * (percentage / 100)
  const topPosition = rect.top + 2

  return createPortal(
    <div
      className="bg-reader-accent border-reader-border pointer-events-none fixed z-500 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
      style={{
        left: `${leftPosition}px`,
        top: `${topPosition}px`,
      }}
    />,
    targetDocument.body,
  )
}

type CustomSliderProps = {
  value: number
  min: number
  max: number
  marks: { position: number; title: string }[] | null
  restrictToMarks: boolean
  onChange: (value: number) => void
  onChangeEnd: (value: number) => void
  formatLabel: (value: number) => string | null
  targetDocument?: Document
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
  formatLabel,
  targetDocument = window.document,
}: CustomSliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const [isTrackHovered, setIsTrackHovered] = useState(false)
  const markRefs = useRef<HTMLButtonElement[]>([])

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
      if (!isDragging) {
        const newValue = getValueFromEvent(e.clientX)
        setHoverValue(newValue)
      }
    },
    [getValueFromEvent, isDragging],
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
    const abortController = new AbortController()
    const { signal } = abortController

    if (isDragging) {
      targetDocument.addEventListener("mousemove", handleMouseOrTouchMove, {
        signal,
      })
      targetDocument.addEventListener("touchmove", handleMouseOrTouchMove, {
        signal,
      })
      targetDocument.addEventListener("mouseup", handleMouseorTouchUp, {
        signal,
      })
      targetDocument.addEventListener("touchend", handleMouseorTouchUp, {
        signal,
      })
      targetDocument.addEventListener("touchcancel", handleMouseorTouchUp, {
        signal,
      })

      return () => {
        abortController.abort()
      }
    }
    return () => {
      abortController.abort()
    }
  }, [handleMouseOrTouchMove, handleMouseorTouchUp, isDragging, targetDocument])

  // initialize markRefs array when marks change
  useEffect(() => {
    if (marks) {
      markRefs.current = markRefs.current.slice(0, marks.length)
    }
  }, [marks])

  return (
    <div
      className="group relative h-1"
      data-hovered={isTrackHovered || undefined}
    >
      {/* track */}
      <div
        ref={trackRef}
        className="after:bg-reader-border/50 absolute inset-0 h-3 cursor-pointer after:absolute after:top-0 after:h-1 after:w-full after:content-['']"
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
        onMouseLeave={() => {
          handleTrackMouseLeave()
        }}
      >
        {/* progress bar */}
        <div
          className={cn(
            "bg-reader-accent absolute top-0 left-0 z-10 h-1 transition-all",
            isDragging ? "duration-0" : "duration-300",
          )}
          style={{
            width: `min(${percentage}%, 100%)`,
          }}
        />

        {/* hover label for free sliding */}
        {!restrictToMarks && hoverValue !== null && (
          <Tooltip
            elementRef={trackRef}
            trackBased={{ value: hoverValue, max }}
            targetDocument={targetDocument}
          >
            <div className="p-2 text-sm">{formatLabel(hoverValue)}</div>
          </Tooltip>
        )}
      </div>
      {/* marks */}
      {marks && (
        <MarkList
          marks={marks}
          handleMarkClick={handleMarkClick}
          formatLabel={formatLabel}
          max={max}
          targetDocument={targetDocument}
        />
      )}
      {/* thumb portal */}
      {!restrictToMarks && isTrackHovered && trackRef.current && (
        <Thumb
          trackRef={trackRef}
          percentage={percentage}
          targetDocument={targetDocument}
        />
      )}
    </div>
  )
}

export const ProgressBar = ({
  book,
  detailView,
  targetDocument = window.document,
}: {
  book: BookWithRelations
  detailView: ReadingPreferences["detailView"]
  targetDocument?: Document
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
        const locator = getCorrespondingMark(marks ?? null, value)?.locator
        if (locator) {
          dispatch(userRequestedTextNavigation({ locator }))
        }
        setTimeout(() => {
          setIsDragging(false)
        }, 300)
        return
      }

      // audio
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

  const formatLabel = useCallback(
    (value: number) => {
      if (detailView.mode === "audio") {
        return formatTime(value)
      }

      if (detailView.scope === "chapter") {
        return null
      }

      return `p. ${value}`
    },
    [detailView.mode, detailView.scope],
  )

  return (
    <CustomSlider
      value={sliderValue}
      max={total}
      min={0}
      marks={formattedMarks}
      restrictToMarks={restrictToMarks}
      onChange={handleChange}
      onChangeEnd={handleChangeEnd}
      formatLabel={formatLabel}
      targetDocument={targetDocument}
    />
  )
}

const MarkList = ({
  marks,
  handleMarkClick,
  max,
  formatLabel,
  targetDocument = window.document,
}: {
  marks: { position: number; title: string }[]
  handleMarkClick: (position: number) => void
  max: number
  formatLabel: (value: number) => string | null
  targetDocument?: Document
}) => {
  const marksWithTinyMarksFilteredOut = marks
    .map((mark, idx) => {
      const nextMark = marks[idx + 1]
      const startPosition = idx === 0 ? 0 : mark.position
      const endPosition = nextMark?.position ?? max
      const markWidth = ((endPosition - startPosition) / max) * 100
      return {
        ...mark,
        originalIndex: idx,
        tooSmall: markWidth < 0.5,
      }
    })
    .filter((mark) => !mark.tooSmall)

  return (
    <div className="pointer-events-none absolute inset-0 h-3">
      {marksWithTinyMarksFilteredOut.map((mark, idx) => {
        // calculating again because we want seemlessness
        const startPosition = mark.originalIndex === 0 ? 0 : mark.position
        const nextMark = marksWithTinyMarksFilteredOut[idx + 1]
        const endPosition = nextMark?.position ?? max
        const markWidth = ((endPosition - startPosition) / max) * 100
        const isLast =
          mark.originalIndex === marksWithTinyMarksFilteredOut.length - 1

        const style = {
          left: `${(startPosition / max) * 100}%`,
          width: `${markWidth}%`,
          minWidth: mark.tooSmall ? "2px" : undefined,
        }

        return (
          <MarkButton
            key={mark.originalIndex}
            mark={mark}
            style={style}
            formatLabel={formatLabel}
            handleMarkClick={handleMarkClick}
            className={cn(
              !isLast &&
                // !isSmall &&
                `after:bg-reader-bg after:absolute after:top-0 after:right-0 after:h-1 after:transition-colors after:content-['']`,
            )}
            targetDocument={targetDocument}
          />
        )
      })}
    </div>
  )
}

const MarkButton = ({
  mark,
  style,
  formatLabel,
  handleMarkClick,
  className,
  targetDocument = window.document,
}: {
  mark: { position: number; title: string }
  style: React.CSSProperties
  formatLabel: (value: number) => string | null
  handleMarkClick: (position: number) => void
  className?: string
  targetDocument?: Document
}) => {
  const [hovered, setHovered] = useState<boolean>(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const onMouseEnter = useCallback(() => {
    setHovered(true)
  }, [])
  const onMouseLeave = useCallback(() => {
    setHovered(false)
  }, [])

  const formattedLabel = formatLabel(mark.position)

  return (
    <>
      <button
        style={style}
        ref={buttonRef}
        className={cn(
          "group/mark pointer-events-auto absolute top-0 z-500 h-5 cursor-pointer transition-all duration-75 group-hover:after:opacity-100 hover:before:opacity-100",
          "before:bg-reader-accent-hover before:absolute before:-top-0.5 before:left-0 before:z-501 before:h-2 before:opacity-0 before:transition-opacity before:content-[''] group-hover/mark:before:opacity-100",

          "before:w-[calc(100%-2px)] after:w-[2px]",
          className,
        )}
        onClick={() => {
          handleMarkClick(mark.position)
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onMouseEnter}
        onBlur={onMouseLeave}
        aria-label={mark.title}
      />
      {hovered && (
        <Tooltip
          targetDocument={targetDocument}
          elementRef={{
            current: buttonRef.current,
          }}
        >
          <p className="m-0 flex flex-col gap-1 px-2 py-1">
            <span className="text-reader-text my-0 block text-xs font-medium">
              {mark.title}
            </span>
            {formattedLabel && (
              <>
                <span className="text-reader-text-secondary block text-[10px]">
                  {formattedLabel}
                </span>
              </>
            )}
          </p>
        </Tooltip>
      )}
    </>
  )
}
