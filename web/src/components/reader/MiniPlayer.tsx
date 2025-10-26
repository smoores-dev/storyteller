"use client"

import { RingProgress, Text, Tooltip } from "@mantine/core"
import {
  useClickOutside,
  useDocumentVisibility,
  useHover,
  usePrevious,
} from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconChevronRight,
  IconHeadphonesOff,
  IconLoader2,
  IconPin,
  IconPinFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRewindBackward15,
  IconRewindForward15,
  IconX,
} from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import {
  closeMiniPlayer,
  skipPartButtonHeld,
  skipPartButtonPressed,
  togglePlay,
} from "@/store/actions"
import { useGetBookQuery } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectCurrentTime,
  selectCurrentTrack,
  selectDuration,
  selectError,
  selectIsLoading,
  selectIsPlaying,
} from "@/store/slices/audioPlayerSlice"
import {
  preferencesSlice,
  removeThemeFromDocument,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { AudiobookCoverImage } from "../books/BookThumbnailImage"

import { usePiPWindow } from "./PipProvider"
import PiPWindow from "./PipWindow"
import { ProgressBar } from "./ProgressBar"
import { ResponsiveSettingsControls } from "./ResponsiveSettingsControls"
import {
  MINI_PLAYER_CARD_HEIGHT,
  MINI_PLAYER_WIDTH,
  NAV_BAR_WIDTH,
} from "./constants"
import { getClientXY } from "./hooks/mouseHelpers"
import { HoldButton } from "./preferenceItems/HoldButton"
import { ToolbarIcon } from "./preferenceItems/ToolbarIcon"

const SNAP_OFFSET = 20
const CORNER_THRESHOLD = 200

type EdgePosition = {
  horizontalEdge: "left" | "right"
  verticalEdge: "top" | "bottom"
  horizontalOffset: number
  verticalOffset: number
}

type Position = { x: number; y: number }

const snapToEdge = (
  x: number,
  y: number,
  elementWidth: number,
  elementHeight: number,
) => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  const distToLeft = x
  const distToRight = windowWidth - (x + elementWidth)
  const distToTop = y
  const distToBottom = windowHeight - (y + elementHeight)

  let snappedX = x
  let snappedY = y

  // snap horizontally if close to an edge
  if (distToLeft < CORNER_THRESHOLD) {
    snappedX = SNAP_OFFSET + NAV_BAR_WIDTH
  } else if (distToRight < CORNER_THRESHOLD) {
    snappedX = windowWidth - elementWidth - SNAP_OFFSET
  }

  // snap vertically if close to an edge
  if (distToTop < CORNER_THRESHOLD) {
    snappedY = SNAP_OFFSET
  } else if (distToBottom < CORNER_THRESHOLD) {
    snappedY = windowHeight - elementHeight - SNAP_OFFSET
  }

  return { x: snappedX, y: snappedY }
}

const edgePositionToAbsolute = (
  edgePos: EdgePosition,
  elementWidth: number,
  elementHeight: number,
): Position => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  let x: number
  let y: number

  if (edgePos.horizontalEdge === "left") {
    x = edgePos.horizontalOffset
  } else {
    x = windowWidth - elementWidth - edgePos.horizontalOffset
  }

  if (edgePos.verticalEdge === "top") {
    y = edgePos.verticalOffset
  } else {
    y = windowHeight - elementHeight - edgePos.verticalOffset
  }

  return { x, y }
}

const absoluteToEdgePosition = (
  x: number,
  y: number,
  elementWidth: number,
  elementHeight: number,
): EdgePosition => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  const distToLeft = x
  const distToRight = windowWidth - (x + elementWidth)
  const distToTop = y
  const distToBottom = windowHeight - (y + elementHeight)

  const horizontalEdge = distToLeft < distToRight ? "left" : "right"
  const verticalEdge = distToTop < distToBottom ? "top" : "bottom"

  const horizontalOffset = horizontalEdge === "left" ? distToLeft : distToRight
  const verticalOffset = verticalEdge === "top" ? distToTop : distToBottom

  return {
    horizontalEdge,
    verticalEdge,
    horizontalOffset,
    verticalOffset,
  }
}

const useDraggableSnap = ({
  enabled,
  elementRef,
  onPositionChange,
  onDragEnd,
}: {
  enabled: boolean
  elementRef: React.RefObject<HTMLElement | HTMLDivElement | null>
  onPositionChange: (pos: Position) => void
  onDragEnd: (edgePos: EdgePosition) => void
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const [isStartingDrag, setIsStartingDrag] = useState(false)

  const handleDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const element = elementRef.current
      if (!enabled || !element) return

      const rect = element.getBoundingClientRect()
      const [clientX, clientY] = getClientXY(e.nativeEvent)

      if (clientX === undefined || clientY === undefined) return
      const offsetX = clientX - rect.left
      const offsetY = clientY - rect.top

      setDragOffset({
        x: offsetX,
        y: offsetY,
      })

      setIsStartingDrag(true)
    },
    [enabled, elementRef],
  )

  const handleMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isStartingDrag) return

      const element = elementRef.current

      if (!element) return

      const [clientX, clientY] = getClientXY(e)
      if (clientX === undefined || clientY === undefined) return

      const x = clientX - dragOffset.x
      const y = clientY - dragOffset.y

      if (!isDragging && y < 40 && x < 40) {
        return
      }

      if (!isDragging) {
        setIsDragging(true)
      }

      onPositionChange({ x, y })
    },
    [
      elementRef,
      dragOffset.x,
      dragOffset.y,
      isDragging,
      isStartingDrag,
      onPositionChange,
    ],
  )

  const handleMouseUp = useCallback(() => {
    const element = elementRef.current
    setIsStartingDrag(false)
    if (!isDragging || !element) return
    setIsDragging(false)
    setIsStartingDrag(false)

    const rect = element.getBoundingClientRect()
    const snapped = snapToEdge(rect.left, rect.top, rect.width, rect.height)

    const edgePos = absoluteToEdgePosition(
      snapped.x,
      snapped.y,
      rect.width,
      rect.height,
    )

    onDragEnd(edgePos)
  }, [isDragging, elementRef, snapToEdge, onDragEnd])

  useEffect(() => {
    const mouseMoveHandler = (e: MouseEvent) => {
      handleMove(e)
    }
    const touchMoveHandler = (e: TouchEvent) => {
      handleMove(e)
    }
    const mouseUpHandler = () => {
      handleMouseUp()
    }
    const touchUpHandler = () => {
      handleMouseUp()
    }

    window.addEventListener("mousemove", mouseMoveHandler)
    window.addEventListener("mouseup", mouseUpHandler)
    window.addEventListener("touchmove", touchMoveHandler)
    window.addEventListener("touchend", touchUpHandler)

    return () => {
      window.removeEventListener("mousemove", mouseMoveHandler)
      window.removeEventListener("mouseup", mouseUpHandler)
      window.removeEventListener("touchmove", touchMoveHandler)
      window.removeEventListener("touchend", touchUpHandler)
    }
  }, [handleMove, handleMouseUp])

  return {
    isDragging,
    handleMouseDown: handleDown,
  }
}

export function MiniPlayer() {
  const { pipWindow } = usePiPWindow()

  const pathname = usePathname()
  const isOnReadPage = useMemo(() => {
    return pathname.includes("/read")
  }, [pathname])

  const readingMode = useAppSelector(selectReadingMode)

  if (readingMode === "epub") {
    return null
  }

  if (isOnReadPage && !pipWindow) {
    return null
  }

  if (pipWindow) {
    return (
      <PiPWindow pipWindow={pipWindow}>
        <MiniPlayerInner context="pip" />
      </PiPWindow>
    )
  }

  return <MiniPlayerInner context="miniplayer" />
}

function MiniPlayerInner({ context }: { context: "pip" | "miniplayer" }) {
  const pathname = usePathname()
  const isOnReadPage = useMemo(() => {
    return pathname.includes("/read")
  }, [pathname])
  const dispatch = useAppDispatch()
  const { requestPipWindow, isSupported, pipWindow } = usePiPWindow()

  // book listening coming from the preferences
  const currentPrefBookId = useAppSelector((state) =>
    selectPreference(state, "currentlyListeningBookId"),
  )
  // book listening coming from the reader
  const currentSeshBook = useAppSelector(selectCurrentBook)
  const minimizedMiniPlayer = useAppSelector((state) =>
    selectPreference(state, "minimizedMiniPlayer"),
  )
  const pinnedMiniPlayer = useAppSelector((state) =>
    selectPreference(state, "pinnedMiniPlayer"),
  )
  const miniPlayerEdgePosition = useAppSelector((state) =>
    selectPreference(state, "miniPlayerPosition"),
  )

  const [miniPlayerPosition, setMiniPlayerPosition] = useState<Position | null>(
    null,
  )

  const bookUuid = currentPrefBookId ?? currentSeshBook?.uuid

  const { data: fetchedBook, isLoading } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  useEffect(() => {
    dispatch(readingSessionSlice.actions.setSyncing(false))

    if (context === "pip" && isOnReadPage) return
    removeThemeFromDocument(document)
  }, [context, isOnReadPage, dispatch])

  const isVisible = useDocumentVisibility()
  const previousDocumentVisibility = usePrevious(isVisible)

  useEffect(() => {
    if (context === "pip" || !isSupported) return

    if (previousDocumentVisibility === isVisible) return
    if (isVisible === "hidden") {
      void requestPipWindow(MINI_PLAYER_WIDTH, MINI_PLAYER_CARD_HEIGHT)
    }
  }, [
    requestPipWindow,
    isVisible,
    previousDocumentVisibility,
    context,
    isSupported,
  ])

  const [pipWindowSize, setPipWindowSize] = useState<{
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    if (context !== "pip" || !pipWindow) return

    function updateSize(e: Event) {
      const wind = e.currentTarget as PictureInPictureWindow | null
      if (!wind) return
      setPipWindowSize({
        width: wind.innerWidth,
        height: wind.innerHeight,
      })
    }

    pipWindow.addEventListener("resize", updateSize)

    return () => {
      pipWindow.removeEventListener("resize", updateSize)
    }
  }, [context, pipWindow])

  const book = currentSeshBook ?? fetchedBook

  useEffect(() => {
    if (currentSeshBook) {
      return
    }

    if (!isLoading && book) {
      dispatch(
        readingSessionSlice.actions.startBook({
          book,
        }),
      )
    }
  }, [isLoading, book, currentSeshBook, dispatch])

  const track = useAppSelector(selectCurrentTrack)

  const miniPlayerRef = useClickOutside<HTMLDivElement>(() => {
    if (!pinnedMiniPlayer && context === "miniplayer") {
      dispatch(
        preferencesSlice.actions.updatePreference({
          key: "minimizedMiniPlayer",
          value: true,
          target: "global",
        }),
      )
    }
  })

  const detailView = useAppSelector((state) =>
    selectPreference(state, "detailView"),
  )

  // calculate absolute position from edge position
  useEffect(() => {
    if (!miniPlayerEdgePosition || !miniPlayerRef.current) {
      setMiniPlayerPosition(null)
      return
    }

    const updatePosition = () => {
      if (!miniPlayerRef.current) return
      const rect = miniPlayerRef.current.getBoundingClientRect()
      const absolutePos = edgePositionToAbsolute(
        miniPlayerEdgePosition,
        rect.width,
        rect.height,
      )
      setMiniPlayerPosition(absolutePos)
    }

    updatePosition()

    window.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("resize", updatePosition)
    }
  }, [miniPlayerEdgePosition])

  const handleTogglePin = () => {
    const newPinned = !pinnedMiniPlayer
    dispatch(
      preferencesSlice.actions.updatePreference({
        key: "pinnedMiniPlayer",
        value: newPinned,
        target: "global",
      }),
    )
    if (!newPinned) {
      dispatch(
        preferencesSlice.actions.updatePreference({
          key: "miniPlayerPosition",
          value: null,
          target: "global",
        }),
      )
      setMiniPlayerPosition(null)
    }
  }

  const { isDragging, handleMouseDown } = useDraggableSnap({
    enabled: pinnedMiniPlayer && context === "miniplayer",
    elementRef: miniPlayerRef,
    onPositionChange: (pos) => {
      setMiniPlayerPosition(pos)
    },
    onDragEnd: (edgePos) => {
      dispatch(
        preferencesSlice.actions.updatePreference({
          key: "miniPlayerPosition",
          value: edgePos,
          target: "global",
        }),
      )
    },
  })

  const isCompactPiP = context === "pip" && (pipWindowSize?.height ?? 0) < 250

  const initialPosition = useMemo(() => {
    if (!miniPlayerRef.current) return { x: 0, y: 0 }
    const rect = miniPlayerRef.current.getBoundingClientRect()
    return snapToEdge(rect.left, rect.top, rect.width, rect.height)
  }, [miniPlayerRef])

  const cardPosition = useMemo(() => {
    if (context === "pip") return undefined

    if (pinnedMiniPlayer) {
      if (miniPlayerPosition) {
        return {
          left: `${miniPlayerPosition.x - NAV_BAR_WIDTH + 8}px`,
          top: `${miniPlayerPosition.y}px`,
          bottom: "auto",
        }
      }

      return {
        left: `${initialPosition.x - NAV_BAR_WIDTH + 8}px`,
        top: `${initialPosition.y}px`,
        bottom: "auto",
      }
    }

    return undefined
  }, [
    context,
    pinnedMiniPlayer,
    miniPlayerPosition,
    initialPosition.x,
    initialPosition.y,
  ])

  if (isLoading || !book || !currentPrefBookId) {
    return null
  }

  return (
    <>
      <footer
        ref={miniPlayerRef}
        style={cardPosition}
        className={cn(
          "bg-reader-bg text-reader-text fixed z-20 flex flex-col overflow-clip rounded-lg border shadow-lg duration-300",
          context === "miniplayer" ? "w-[85%] md:w-[400px]" : "bottom-0 w-full",
          context === "miniplayer" &&
            !pinnedMiniPlayer &&
            "bottom-10 left-[42%] -translate-x-1/2",
          !minimizedMiniPlayer
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-40 opacity-0",
          isDragging && "cursor-grabbing",
          !isDragging
            ? "transition-[transform,_opacity,_top,_left,_right,_bottom]"
            : "transition-[transform,_opacity]",
          pinnedMiniPlayer && !isDragging && "cursor-grab",
        )}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <nav className="bg-reader-bg flex w-full items-center justify-between gap-1 px-4 py-2">
          <div className="flex items-center gap-1">
            <ToolbarIcon
              icon={<IconX size={18} className="text-reader-text" />}
              label="Close mini player"
              onClick={(e) => {
                e.stopPropagation()
                dispatch(closeMiniPlayer())
              }}
            />
            {context === "miniplayer" && (
              <ToolbarIcon
                icon={
                  pinnedMiniPlayer ? (
                    <IconPinFilled size={18} className="text-reader-accent" />
                  ) : (
                    <IconPin size={18} className="text-reader-text" />
                  )
                }
                label={
                  pinnedMiniPlayer ? "Unpin mini player" : "Pin mini player"
                }
                onClick={(e) => {
                  e.stopPropagation()
                  handleTogglePin()
                }}
              />
            )}
          </div>
          <div
            className="flex shrink items-center gap-1"
            onClick={() => {
              // e.stopPropagation()
            }}
          >
            {!isCompactPiP && (
              <ResponsiveSettingsControls book={book} context="miniplayer" />
            )}
            {context === "pip" ? (
              <button
                className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative rounded-sm bg-transparent p-1.5"
                onClick={() => {
                  if (!pipWindow) return
                  window.focus()
                  pipWindow.close()
                }}
              >
                <IconArrowLeft size={18} className="text-reader-text" />
                <span className="sr-only">Return to reader</span>
              </button>
            ) : (
              <Tooltip label="Go to book">
                <Link
                  href={`/books/${book.uuid}/read`}
                  className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative rounded-sm bg-transparent p-1.5"
                >
                  <IconChevronRight size={18} />
                  <span className="sr-only">Go to book</span>
                </Link>
              </Tooltip>
            )}
          </div>
        </nav>

        <div
          className={cn(
            "flex w-full gap-4 p-4 pb-2",
            isCompactPiP ? "items-center" : "flex-col items-center",
            "[&_img]:pointer-events-none",
          )}
        >
          {!isCompactPiP && (
            <AudiobookCoverImage
              book={book}
              imageHeight={160}
              imageWidth={160}
              width="160px"
              height="160px"
              className="rounded-md"
            />
          )}

          <div
            className={cn(
              "flex w-full flex-col gap-3",
              isCompactPiP && "flex-1",
            )}
          >
            <div className="flex flex-col items-center gap-1">
              <Text className="text-reader-text-muted line-clamp-1 text-xs font-medium">
                {track?.title}
              </Text>
              <button
                className="text-left"
                onClick={() => {
                  dispatch(
                    preferencesSlice.actions.toggleBookDetailView({
                      target: book.uuid,
                      mode: "audiobook",
                    }),
                  )
                }}
              >
                <Text className="text-reader-text font-heading line-clamp-1 text-base font-semibold">
                  {book.title}
                </Text>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-2">
            <PlayerControls />
          </div>
          <ProgressBar
            book={book}
            context={context === "pip" ? "pip" : "mini-player"}
            detailView={{
              mode: "audio",
              scope: detailView.scope,
            }}
          />
        </div>
      </footer>

      {context === "miniplayer" && (
        <MiniPlayerCircle
          book={book}
          minimizedMiniPlayer={minimizedMiniPlayer}
          pinnedMiniPlayer={pinnedMiniPlayer}
          edgePosition={miniPlayerEdgePosition}
          onOpenAction={() => {
            dispatch(
              preferencesSlice.actions.updatePreference({
                key: "minimizedMiniPlayer",
                value: false,
                target: "global",
              }),
            )
          }}
          onDragEndAction={(edgePos) => {
            dispatch(
              preferencesSlice.actions.updatePreference({
                key: "miniPlayerPosition",
                value: edgePos,
                target: "global",
              }),
            )
          }}
        />
      )}
    </>
  )
}

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

    window.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("resize", updatePosition)
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
          className="h-full w-full overflow-clip"
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

export const PlayerControls = ({
  variant = "full",
}: {
  variant?: "full" | "minimized"
}) => {
  const dispatch = useAppDispatch()
  const loading = useAppSelector(selectIsLoading)
  const playing = useAppSelector(selectIsPlaying)
  const error = useAppSelector(selectError)

  const buttonClassName =
    variant === "minimized"
      ? "border-reader-accent text-reader-accent bg-reader-bg rounded-full border-2 p-2"
      : "text-reader-text hover:text-reader-accent-hover hover:bg-reader-surface-hover bg-transparent p-1"

  const holdButtonClassName =
    variant === "minimized"
      ? "border-reader-accent text-reader-accent bg-reader-bg rounded-full border-2 p-2"
      : "text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative mt-1 rounded-full bg-transparent"

  return (
    <>
      <HoldButton
        tooltip="Skip backward 15 seconds"
        holdTooltip="Skip to previous chapter"
        onHold={() => {
          dispatch(
            skipPartButtonHeld({
              direction: "previous",
              context: "miniplayer",
            }),
          )
        }}
        className={holdButtonClassName}
        onClick={() => {
          dispatch(
            skipPartButtonPressed({
              direction: "previous",
              context: "miniplayer",
            }),
          )
        }}
      >
        <span className="sr-only">Skip backward 15 seconds</span>
        <IconRewindBackward15 size={18} />
      </HoldButton>

      <button
        className={buttonClassName}
        onClick={() => {
          dispatch(togglePlay())
        }}
      >
        {loading ? (
          <>
            <span className="sr-only">Buffering</span>
            <IconLoader2 className="animate-spin" size={24} />
          </>
        ) : playing ? (
          <>
            <span className="sr-only">Pause</span>
            <IconPlayerPauseFilled size={24} />
          </>
        ) : error ? (
          <>
            <span className="sr-only">Error</span>
            <IconAlertCircle size={24} />
          </>
        ) : (
          <>
            <span className="sr-only">Play</span>
            <IconPlayerPlayFilled size={24} />
          </>
        )}
      </button>

      <HoldButton
        tooltip="Skip forward 15 seconds"
        holdTooltip="Skip to next chapter"
        onHold={() => {
          dispatch(
            skipPartButtonHeld({
              direction: "next",
              context: "miniplayer",
            }),
          )
        }}
        className={holdButtonClassName}
        onClick={() => {
          dispatch(
            skipPartButtonPressed({
              direction: "next",
              context: "miniplayer",
            }),
          )
        }}
      >
        <span className="sr-only">Skip forward 15 seconds</span>
        <IconRewindForward15 size={18} />
      </HoldButton>
    </>
  )
}
