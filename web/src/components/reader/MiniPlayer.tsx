"use client"

import { Text, Tooltip } from "@mantine/core"
import { useDocumentVisibility, usePrevious } from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconChevronRight,
  IconChevronUp,
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRewindBackward15,
  IconRewindForward15,
} from "@tabler/icons-react"
import classNames from "classnames"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { cn } from "@/cn"
import { AudioPlayer } from "@/services/AudioPlayerService"
import {
  skipPartButtonHeld,
  skipPartButtonPressed,
  togglePlay,
} from "@/store/actions"
import { useGetBookQuery } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectError,
  selectIsLoading,
  selectIsPlaying,
} from "@/store/slices/audioPlayerSlice"
import {
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
  MINI_PLAYER_EXPANDED_HEIGHT,
  MINI_PLAYER_HEIGHT,
  MINI_PLAYER_WIDTH,
} from "./constants"
import { HoldButton } from "./preferenceItems/HoldButton"

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
  const playing = useAppSelector(selectIsPlaying)
  const loading = useAppSelector(selectIsLoading)
  const error = useAppSelector(selectError)

  const bookUuid = currentPrefBookId ?? currentSeshBook?.uuid

  const { data: fetchedBook, isLoading } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  useEffect(() => {
    if (context === "pip" && isOnReadPage) return
    // TODO: do this more elegantly
    removeThemeFromDocument(document)
  }, [context, isOnReadPage])

  const isVisible = useDocumentVisibility()
  const previousDocumentVisibility = usePrevious(isVisible)

  useEffect(() => {
    if (context === "pip" || !isSupported) return

    if (previousDocumentVisibility === isVisible) return
    if (isVisible === "hidden") {
      void requestPipWindow(MINI_PLAYER_WIDTH, MINI_PLAYER_HEIGHT)
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

    // listen for resize events
    pipWindow.addEventListener("resize", updateSize)

    return () => {
      pipWindow.removeEventListener("resize", updateSize)
    }
  }, [context, pipWindow])

  const book = currentSeshBook ?? fetchedBook

  useEffect(() => {
    // no need to reopen already playing book
    if (currentSeshBook) {
      return
    }

    // open book
    if (!isLoading && book) {
      dispatch(
        readingSessionSlice.actions.startBook({
          book,
          readingContext: "miniplayer",
        }),
      )
    }
  }, [isLoading, book, currentSeshBook, dispatch])

  const [isExpanded, setIsExpanded] = useState(false)
  const track = AudioPlayer.getActiveTrack()

  if (isLoading || !book || !currentPrefBookId) {
    return null
  }

  // determine layout mode based on pip window height
  // show expanded layout (with cover) if height > 150px
  const showExpandedLayout =
    context === "pip" ? (pipWindowSize?.height ?? 0) > 150 : isExpanded

  return (
    <footer
      style={
        context === "miniplayer"
          ? {
              left: "calc(46%)",
              transform: "translateX(-54%)",
            }
          : {}
      }
      className={cn(
        "bg-reader-bg text-reader-text z-20 overflow-clip rounded-b-lg shadow-sm md:w-auto",
        `min-w-[${MINI_PLAYER_WIDTH}px]`,
        context === "miniplayer" &&
          `fixed w-[85%] border ${minimizedMiniPlayer ? "-bottom-16 hover:bottom-0" : "bottom-10"}`,
        showExpandedLayout && "rounded-t-lg",
      )}
    >
      <div
        className={cn(
          showExpandedLayout ? "h-auto" : "h-0",
          "flex flex-col items-center justify-center gap-2",
          context === "miniplayer" && "transition-all duration-500",
        )}
      >
        <div className="bg-reader-bg/50 flex w-full items-center justify-end gap-1 px-4 py-2">
          <ResponsiveSettingsControls book={book} context="miniplayer" />
          <Tooltip label="Go to book">
            <Link
              href={`/books/${book.uuid}/read`}
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative rounded-md bg-transparent p-1.5"
            >
              <IconChevronRight size={20} />
              <span className="sr-only">Go to book</span>
            </Link>
          </Tooltip>
        </div>
        <div className="flex h-full w-full flex-col items-center justify-center gap-8 p-6">
          <AudiobookCoverImage
            book={book}
            imageHeight={300}
            imageWidth={300}
            width="80%"
            height="auto"
          />
          <Text className="text-reader-text-muted line-clamp-1 text-center font-medium">
            {track?.title ?? book.title}
          </Text>
        </div>
      </div>

      <div
        className={cn(
          "relative z-20 w-full",
          context === "pip" && "fixed bottom-16",
        )}
      >
        <ProgressBar
          book={book}
          context={context === "pip" ? "pip" : undefined}
          detailView={{
            mode: "audio",
            scope: "chapter",
          }}
        />
      </div>

      {/* Main content */}
      <div
        className={cn(
          "bg-reader-bg relative z-10 px-4 py-3",
          context === "pip" && "fixed bottom-0 w-full",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <AudiobookCoverImage
            book={book}
            height="2.5rem"
            width="2.5rem"
            className={cn(
              "transition-opacity duration-500",
              !showExpandedLayout ? "opacity-100" : "opacity-0",
            )}
          />

          <div className="flex items-center">
            <HoldButton
              tooltip="Skip backward 15 seconds"
              holdTooltip="Skip to previous chapter"
              onHold={() => {
                dispatch(skipPartButtonHeld("previous"))
              }}
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative mt-1 rounded-full bg-transparent"
              onClick={() => {
                dispatch(skipPartButtonPressed("previous"))
              }}
            >
              <span className="sr-only">Skip backward 15 seconds</span>
              <IconRewindBackward15 size={18} />
            </HoldButton>
            <button
              className={classNames(
                `text-reader-text hover:text-reader-accent-hover hover:bg-reader-surface-hover bg-transparent p-1`,
              )}
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
                dispatch(skipPartButtonHeld("next"))
              }}
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative mt-1 rounded-full bg-transparent"
              onClick={() => {
                dispatch(skipPartButtonPressed("next"))
              }}
            >
              <span className="sr-only">Skip forward 15 seconds</span>
              <IconRewindForward15 size={18} />
            </HoldButton>
          </div>

          <div className="flex items-center gap-2">
            {context === "pip" && (
              <button
                className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative rounded-full bg-transparent"
                onClick={() => {
                  if (!pipWindow) return
                  window.focus()
                  pipWindow.close()
                }}
              >
                <IconArrowLeft size={20} className="text-reader-text" />
                <span className="sr-only">Return to reader</span>
              </button>
            )}
            <button
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative rounded-full bg-transparent p-2"
              onClick={() => {
                setIsExpanded(!showExpandedLayout)
                if (pipWindow) {
                  pipWindow.resizeTo(
                    MINI_PLAYER_WIDTH,
                    showExpandedLayout
                      ? MINI_PLAYER_HEIGHT
                      : MINI_PLAYER_EXPANDED_HEIGHT,
                  )
                }
              }}
            >
              <IconChevronUp
                size={20}
                className={cn(
                  "text-reader-text transition-transform",
                  showExpandedLayout && "-rotate-180",
                )}
              />
              <span className="sr-only">Expand</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
