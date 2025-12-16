"use client"

import { Text, Tooltip } from "@mantine/core"
import {
  useClickOutside,
  useDocumentVisibility,
  usePrevious,
} from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconChevronRight,
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
import { useEffect, useMemo, useState } from "react"

import { cn } from "@/cn"
import { AudiobookCoverImage } from "@/components/books/BookThumbnailImage"
import { usePiPWindow } from "@/components/reader/PipProvider"
import PiPWindow from "@/components/reader/PipWindow"
import { ProgressBar } from "@/components/reader/ProgressBar"
import { ResponsiveSettingsControls } from "@/components/reader/ResponsiveSettingsControls"
import {
  MINI_PLAYER_CARD_HEIGHT,
  MINI_PLAYER_WIDTH,
  NAV_BAR_WIDTH,
} from "@/components/reader/constants"
import { HoldButton } from "@/components/reader/preferenceItems/HoldButton"
import { ScrollingTitle } from "@/components/reader/preferenceItems/ScrollingTitle"
import { ToolbarIcon } from "@/components/reader/preferenceItems/ToolbarIcon"
import { AudioPlayer } from "@/services/AudioPlayerService"
import {
  closeMiniPlayer,
  pauseButtonPressed,
  playButtonPressed,
  skipPartButtonHeld,
  skipPartButtonPressed,
} from "@/store/actions"
import { useGetBookQuery } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectCurrentTrack,
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

import { MiniPlayerCircle } from "./MiniPlayerCircle"
import {
  type Position,
  edgePositionToAbsolute,
  snapToEdge,
} from "./positionFns"
import { useDraggableSnap } from "./useDraggableSnap"

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
    if (isVisible === "hidden" && AudioPlayer.getState().playing) {
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

    const abortController = new AbortController()
    const { signal } = abortController

    function updateSize(e: Event) {
      const wind = e.currentTarget as PictureInPictureWindow | null
      if (!wind) return
      setPipWindowSize({
        width: wind.innerWidth,
        height: wind.innerHeight,
      })
    }

    pipWindow.addEventListener("resize", updateSize, { signal })

    return () => {
      abortController.abort()
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

    const abortController = new AbortController()
    const { signal } = abortController

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

    window.addEventListener("resize", updatePosition, { signal })
    return () => {
      abortController.abort()
    }
  }, [miniPlayerEdgePosition, miniPlayerRef])

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

  const style = useMemo(() => {
    if (context === "pip") {
      return {
        height: "100%",
      }
    }

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
        style={style}
        className={cn(
          "bg-reader-bg text-reader-text fixed z-20 flex flex-col overflow-clip rounded-lg border shadow-lg duration-300",
          context === "miniplayer" ? "w-[85%] md:w-[400px]" : "bottom-0 w-full",
          context === "miniplayer" &&
            !pinnedMiniPlayer &&
            "bottom-10 left-[42%] -translate-x-1/2",
          !minimizedMiniPlayer || context === "pip"
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
        <nav
          className={cn(
            "bg-reader-bg flex w-full items-center justify-between gap-1 px-4 py-2",
            isCompactPiP && "absolute left-0 right-0 top-0 bg-transparent",
          )}
        >
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
          <div className="flex shrink items-center gap-1">
            {!isCompactPiP && (
              <ResponsiveSettingsControls
                book={book}
                context="miniplayer"
                targetDocument={
                  context === "pip" && pipWindow?.document
                    ? pipWindow.document
                    : window.document
                }
              />
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

        {!isCompactPiP && (
          <div
            className={cn(
              "flex w-full grow gap-4 p-4 pb-2",
              "flex-col items-center justify-center",
              "[&_img]:pointer-events-none",
            )}
          >
            <AudiobookCoverImage
              book={book}
              imageHeight={160}
              imageWidth={160}
              width="160px"
              height="160px"
              className="rounded-md"
            />

            <div
              className={cn(
                "flex max-w-[75%] flex-col items-center gap-3 overflow-hidden",
              )}
            >
              <div className="flex min-w-0 max-w-full flex-col items-center gap-1 overflow-hidden">
                <ScrollingTitle
                  scrollSpeed={30}
                  scrollInterval={20000}
                  fadeWidth={40}
                >
                  <span className="text-reader-text-muted ine-clamp-1 text-xs font-medium">
                    {track?.title}
                  </span>
                </ScrollingTitle>
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
        )}

        <div className={cn("flex flex-col gap-4", isCompactPiP && "flex-1")}>
          <div
            className={cn(
              "flex items-center justify-center gap-2",
              isCompactPiP && "flex-1",
            )}
          >
            <PlayerControls />
          </div>
          <ProgressBar
            book={book}
            targetDocument={
              context === "pip" && pipWindow?.document
                ? pipWindow.document
                : window.document
            }
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
          if (playing) {
            dispatch(pauseButtonPressed())
          } else {
            dispatch(playButtonPressed())
          }
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
