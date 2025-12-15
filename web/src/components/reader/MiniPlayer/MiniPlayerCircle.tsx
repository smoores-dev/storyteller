import { RingProgress } from "@mantine/core"
import { useHover } from "@mantine/hooks"
import { IconHeadphonesOff } from "@tabler/icons-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/cn"
import { AudiobookCoverImage } from "@/components/books/BookThumbnailImage"
import { type BookWithRelations } from "@/database/books"
import { useAppSelector } from "@/store/appState"
import {
  selectCurrentTime,
  selectDuration,
  selectIsPlaying,
} from "@/store/slices/audioPlayerSlice"
import { type EdgePosition } from "@/store/slices/preferencesSlice"

import { NAV_BAR_WIDTH } from "../constants"

import { PlayerControls } from "./MiniPlayer"
import { type Position, edgePositionToAbsolute } from "./positionFns"
import { useDraggableSnap } from "./useDraggableSnap"

export const MiniPlayerCircle = ({
  book,
  minimizedMiniPlayer,
  pinnedMiniPlayer,
  edgePosition: savedEdgePosition,
  onOpenAction,
  onDragEndAction,
}: {
  book: BookWithRelations
  minimizedMiniPlayer: boolean
  pinnedMiniPlayer: boolean
  edgePosition: EdgePosition | null
  onOpenAction: () => void
  onDragEndAction: (edgePos: EdgePosition) => void
}) => {
  const currentTime = useAppSelector(selectCurrentTime)
  const duration = useAppSelector(selectDuration)
  const playing = useAppSelector(selectIsPlaying)

  const circleContainerRef = useRef<HTMLDivElement>(null)
  const { hovered: circleHovered, ref: circleRef } = useHover()
  const { hovered: controlsHovered, ref: controlsRef } = useHover()

  const [circlePosition, setCirclePosition] = useState<Position | null>(null)

  const showControls = circleHovered || controlsHovered

  // calculate absolute position from edge position
  useEffect(() => {
    if (!savedEdgePosition || !circleContainerRef.current) {
      setCirclePosition(null)
      return
    }

    const abortController = new AbortController()
    const { signal } = abortController

    const updatePosition = () => {
      if (!circleContainerRef.current) return
      const rect = circleContainerRef.current.getBoundingClientRect()
      const absolutePos = edgePositionToAbsolute(
        savedEdgePosition,
        rect.width,
        rect.height,
      )
      setCirclePosition(absolutePos)
    }

    updatePosition()

    window.addEventListener("resize", updatePosition, { signal })
    return () => {
      abortController.abort()
    }
  }, [savedEdgePosition])

  const { isDragging, handleMouseDown } = useDraggableSnap({
    enabled: true,
    elementRef: circleContainerRef,
    onPositionChange: (pos) => {
      setCirclePosition(pos)
    },
    onDragEnd: onDragEndAction,
  })

  const correctCirclePosition = useMemo(() => {
    if (circlePosition) {
      return {
        left: `${circlePosition.x - NAV_BAR_WIDTH + 8}px`,
        top: `${circlePosition.y}px`,
        bottom: "auto",
        right: "auto",
      }
    }
    return undefined
  }, [circlePosition])

  const controlSide =
    (circlePosition?.x ?? 0) < window.innerWidth / 2 ? "left" : "right"

  return (
    <div
      ref={circleContainerRef}
      style={correctCirclePosition}
      className={cn(
        "text-reader-text fixed z-20 duration-300",
        !pinnedMiniPlayer && "bottom-10 right-10",
        minimizedMiniPlayer
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-40 opacity-0",
        isDragging && "cursor-grabbing",
        isDragging
          ? "transition-[transform,opacity]"
          : "transition-[transform,_opacity,_left,_top,_bottom,_right]",
        pinnedMiniPlayer && !isDragging && "cursor-grab",
      )}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
    >
      <div
        ref={controlsRef}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 transition-[opacity,_right,_left] duration-200",
          showControls
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",

          controlSide === "left" ? "-right-36" : "right-14",
        )}
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
      >
        <div className="flex items-center gap-2 pr-2">
          <PlayerControls variant="minimized" />
        </div>
      </div>

      <button
        ref={circleRef}
        onMouseUp={() => {
          if (isDragging) return
          onOpenAction()
        }}
        className={cn(
          "text-reader-text bg-reader-bg relative z-20 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg transition-transform duration-200",
        )}
        aria-label="Open mini player"
      >
        <RingProgress
          size={66}
          thickness={4}
          sections={[
            { value: (currentTime / duration) * 100, color: "orange" },
          ]}
          className={cn("h-full w-full overflow-clip")}
          classNames={{
            svg: "z-10 relative",
            label:
              "h-full w-full flex items-center justify-center rounded-full overflow-clip absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          }}
          label={
            <>
              <AudiobookCoverImage
                book={book}
                height="50px"
                width="50px"
                imageHeight={50}
                imageWidth={50}
                className={cn(
                  "rounded-full transition-opacity duration-300",
                  !playing && "opacity-40 grayscale",
                )}
              />
              {!playing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <IconHeadphonesOff
                    size={14}
                    className="text-reader-text drop-shadow"
                  />
                </div>
              )}
            </>
          }
        />
      </button>
    </div>
  )
}
