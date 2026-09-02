"use client"

import { skipToken } from "@reduxjs/toolkit/query"
import { type DragControls, motion } from "motion/react"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { Cover } from "@v3/_/components/books/Cover"
import { usePiPWindow } from "@v3/_/components/reader/PipProvider"
import PiPWindow from "@v3/_/components/reader/PipWindow"
import {
  MINI_PLAYER_HEIGHT,
  MINI_PLAYER_WIDTH,
} from "@v3/_/components/reader/constants"
import { formatTime } from "@v3/_/components/reader/preferenceItems/formatTime"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { V3Link } from "@v3/_/components/v3-link"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { readerPlayer } from "@/services/AudioPlayerService"
import { closeMiniPlayer, playerPositionSeeked } from "@/store/actions"
import { useGetBookQuery } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectCurrentTime,
  selectCurrentTrack,
  selectDuration,
  selectIsPlaying,
} from "@/store/slices/audioPlayerSlice"
import {
  type MiniPlayerCorner,
  preferencesSlice,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { FloatingPlayer } from "./FloatingPlayer"
import { PipPlayer } from "./PipPlayer"
import { PlayerControls } from "./PlayerControls"
import { ProgressRing } from "./ProgressRing"
import { SpeedMenu } from "./SpeedMenu"

const CIRCLE_SIZE = 64
const RING_THICKNESS = 4
const CLICK_SLOP_PX = 4

const subscribeToNothing = () => () => {}

export function MiniPlayer() {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  )
  const pathname = usePathname()
  const isOnReadPage = pathname.includes("/read")
  const dispatch = useAppDispatch()
  const { pipWindow, requestPipWindow, isSupported } = usePiPWindow()
  const readingMode = useAppSelector(selectReadingMode)
  const track = useAppSelector(selectCurrentTrack)
  const listeningBookId = useAppSelector((state) =>
    selectPreference(state, "currentlyListeningBookId"),
  )
  const sessionBook = useAppSelector(selectCurrentBook)
  const recoveredBookId =
    mounted && !isOnReadPage && !sessionBook ? listeningBookId : null
  const { data: fetchedBook, isLoading } = useGetBookQuery(
    recoveredBookId ? { uuid: recoveredBookId } : skipToken,
  )
  const book = sessionBook ?? (recoveredBookId ? fetchedBook : undefined)

  useEffect(() => {
    if (!recoveredBookId || isLoading || !fetchedBook) return
    dispatch(
      readingSessionSlice.actions.startBook({
        book: fetchedBook,
        requestedMode: fetchedBook.audiobook ? "audiobook" : "readaloud",
      }),
    )
  }, [recoveredBookId, isLoading, fetchedBook, dispatch])

  useEffect(() => {
    if (isOnReadPage) return
    dispatch(readingSessionSlice.actions.setSyncing(false))
  }, [isOnReadPage, dispatch])

  useEffect(() => {
    if (isOnReadPage || !isSupported) return
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return
      if (!readerPlayer().getState().playing) return
      void requestPipWindow(MINI_PLAYER_WIDTH, MINI_PLAYER_HEIGHT)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [isOnReadPage, isSupported, requestPipWindow])

  if (!mounted || !book || !track || readingMode === "epub") return null

  if (pipWindow) {
    return (
      <PiPWindow pipWindow={pipWindow}>
        <PipPlayer book={book} pipWindow={pipWindow} />
      </PiPWindow>
    )
  }

  if (isOnReadPage) return null

  return <FloatingMiniPlayer book={book} />
}

function FloatingMiniPlayer({ book }: { book: BookWithRelations }) {
  const dispatch = useAppDispatch()
  const corner = useAppSelector((state) =>
    selectPreference(state, "miniPlayerCorner"),
  )
  const collapsed = useAppSelector((state) =>
    selectPreference(state, "minimizedMiniPlayer"),
  )
  const currentTime = useAppSelector(selectCurrentTime)
  const duration = useAppSelector(selectDuration)
  const playing = useAppSelector(selectIsPlaying)
  const pressPoint = useRef({ x: 0, y: 0 })

  const setCollapsed = (value: boolean) =>
    dispatch(
      preferencesSlice.actions.updatePreference({
        key: "minimizedMiniPlayer",
        value,
        target: "global",
      }),
    )

  return (
    <FloatingPlayer
      corner={corner}
      expanded={!collapsed}
      onCornerChange={(value: MiniPlayerCorner) =>
        dispatch(
          preferencesSlice.actions.updatePreference({
            key: "miniPlayerCorner",
            value,
            target: "global",
          }),
        )
      }
      style={{ borderRadius: collapsed ? CIRCLE_SIZE / 2 : 16 }}
      className={cn(
        "bg-popover text-popover-foreground border-border overflow-hidden border shadow-lg",
        !collapsed && "w-[min(24rem,calc(100vw-2rem))]",
      )}
    >
      {(dragControls) => (
        <motion.div
          key={collapsed ? "circle" : "card"}
          layout="position"
          layoutDependency={collapsed}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {collapsed ? (
            <button
              type="button"
              aria-label="Open the player"
              onPointerDown={(event) => {
                pressPoint.current = { x: event.clientX, y: event.clientY }
                dragControls.start(event)
              }}
              onClick={(event) => {
                if (
                  Math.hypot(
                    event.clientX - pressPoint.current.x,
                    event.clientY - pressPoint.current.y,
                  ) > CLICK_SLOP_PX
                ) {
                  return
                }
                setCollapsed(false)
              }}
              className="block cursor-grab active:cursor-grabbing"
            >
              <ProgressRing
                value={duration > 0 ? currentTime / duration : 0}
                size={CIRCLE_SIZE}
                thickness={RING_THICKNESS}
              >
                <Cover
                  book={book}
                  width={CIRCLE_SIZE - RING_THICKNESS * 2}
                  fill
                  interactive={false}
                  displayMode="audiobook"
                  className={cn(
                    "size-full transition-[opacity,filter] duration-300",
                    !playing && "opacity-60 grayscale",
                  )}
                />
              </ProgressRing>
            </button>
          ) : (
            <ExpandedCard
              book={book}
              dragControls={dragControls}
              onCollapse={() => setCollapsed(true)}
            />
          )}
        </motion.div>
      )}
    </FloatingPlayer>
  )
}

function ExpandedCard({
  book,
  dragControls,
  onCollapse,
}: {
  book: BookWithRelations
  dragControls: DragControls
  onCollapse: () => void
}) {
  const dispatch = useAppDispatch()
  const track = useAppSelector(selectCurrentTrack)
  const mode = useAppSelector(selectReadingMode)
  const startDrag = (event: React.PointerEvent) => {
    if ((event.target as Element).closest("button,a,[role=menuitem]")) return
    dragControls.start(event)
  }

  return (
    <div className="flex flex-col">
      <div
        onPointerDown={startDrag}
        className="flex cursor-grab items-center gap-1 px-2 pt-2 active:cursor-grabbing"
      >
        <TooltipButton
          variant="ghost"
          tooltip="Collapse"
          aria-label="Collapse the player"
          onClick={onCollapse}
        >
          <icon.ChevronDown />
        </TooltipButton>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {track?.title}
        </span>
        <SpeedMenu book={book} />
        <TooltipButton
          variant="ghost"
          tooltip="Back to the book"
          aria-label="Back to the book"
          nativeButton={false}
          render={<V3Link href={`/books/${book.uuid}/read?mode=${mode}`} />}
        >
          <icon.ArrowUpRight />
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          tooltip="Stop listening"
          aria-label="Stop listening"
          onClick={() => dispatch(closeMiniPlayer())}
        >
          <icon.Close />
        </TooltipButton>
      </div>
      <div className="flex items-center gap-3 px-3 py-2">
        <div
          onPointerDown={startDrag}
          className="cursor-grab active:cursor-grabbing"
        >
          <Cover book={book} width={56} interactive={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-sm font-semibold">
            {book.title}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {book.authors.map((author) => author.name).join(", ")}
          </p>
        </div>
        <div className="flex items-center">
          <PlayerControls />
        </div>
      </div>
      <div className="px-3 pb-3">
        <SeekBar />
      </div>
    </div>
  )
}

function SeekBar() {
  const dispatch = useAppDispatch()
  const currentTime = useAppSelector(selectCurrentTime)
  const duration = useAppSelector(selectDuration)
  const [scrub, setScrub] = useState<number | null>(null)
  const shown = scrub ?? currentTime
  const fraction = duration > 0 ? Math.min(Math.max(shown / duration, 0), 1) : 0

  const timeAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return (
      Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) *
      duration
    )
  }

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-[0.625rem] tabular-nums">
      <span className="shrink-0">{formatTime(shown)}</span>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Position in this track"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={formatTime(shown)}
        className="group/seek focus-visible:ring-ring/30 relative h-4 flex-1 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setScrub(timeAt(event))
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          setScrub(timeAt(event))
        }}
        onPointerUp={(event) => {
          dispatch(playerPositionSeeked({ progress: timeAt(event) }))
          setScrub(null)
        }}
        onPointerCancel={() => {
          setScrub(null)
        }}
        onKeyDown={(event) => {
          const delta =
            event.key === "ArrowLeft"
              ? -15
              : event.key === "ArrowRight"
                ? 15
                : 0
          if (delta === 0) return
          event.preventDefault()
          dispatch(
            playerPositionSeeked({
              progress: Math.min(Math.max(currentTime + delta, 0), duration),
            }),
          )
        }}
      >
        <div className="bg-muted absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <div
          className="bg-primary absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow-sm transition-opacity group-hover/seek:opacity-100 group-focus-visible/seek:opacity-100"
          style={{ left: `${fraction * 100}%` }}
        />
      </div>
      <span className="shrink-0">
        -{formatTime(Math.max(duration - shown, 0))}
      </span>
    </div>
  )
}
