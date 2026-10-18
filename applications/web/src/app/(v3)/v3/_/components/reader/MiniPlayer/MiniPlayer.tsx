"use client"

import { skipToken } from "@reduxjs/toolkit/query"
import { motion } from "motion/react"
import { usePathname } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"

import { Cover } from "@v3/_/components/books/Cover"
import { useCoverScope } from "@v3/_/components/books/CoverScope"
import {
  CARD_CIRCLE_SIZE,
  CARD_RADIUS,
  CARD_RING_THICKNESS,
  FloatingCard,
  FloatingCardBody,
  FloatingCardButton,
  FloatingCardContent,
  FloatingCardFooter,
  FloatingCardHeader,
  FloatingCardMedia,
  FloatingCardTitle,
} from "@v3/_/components/floating/FloatingCard"
import { usePiPWindow } from "@v3/_/components/reader/PipProvider"
import PiPWindow from "@v3/_/components/reader/PipWindow"
import {
  MINI_PLAYER_HEIGHT,
  MINI_PLAYER_WIDTH,
} from "@v3/_/components/reader/constants"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import { formatTime } from "@/formatTime"
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
  preferencesSlice,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { PipPlayer } from "./PipPlayer"
import { PlayerControls } from "./PlayerControls"
import { ProgressRing } from "./ProgressRing"
import { SpeedMenu } from "./SpeedMenu"

const CIRCLE_SIZE = CARD_CIRCLE_SIZE
const RING_THICKNESS = CARD_RING_THICKNESS

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
  const collapsed = useAppSelector((state) =>
    selectPreference(state, "minimizedMiniPlayer"),
  )
  const currentTime = useAppSelector(selectCurrentTime)
  const duration = useAppSelector(selectDuration)
  const playing = useAppSelector(selectIsPlaying)

  const setCollapsed = (value: boolean) =>
    dispatch(
      preferencesSlice.actions.updatePreference({
        key: "minimizedMiniPlayer",
        value,
        target: "global",
      }),
    )

  const coverScope = useCoverScope(book)
  const t = useTranslation("Reader.miniPlayer")

  return (
    <FloatingCard
      style={{ borderRadius: collapsed ? CIRCLE_SIZE / 2 : CARD_RADIUS }}
      className={cn(!collapsed && "w-[min(24rem,calc(100vw-2rem))]")}
    >
      <motion.div
        key={collapsed ? "circle" : "card"}
        layout="position"
        layoutDependency={collapsed}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={coverScope.style}
      >
        {collapsed ? (
          <FloatingCardButton
            aria-label={t.plain("open")}
            onClick={() => setCollapsed(false)}
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
          </FloatingCardButton>
        ) : (
          <ExpandedCard book={book} onCollapse={() => setCollapsed(true)} />
        )}
      </motion.div>
    </FloatingCard>
  )
}

function ExpandedCard({
  book,
  onCollapse,
}: {
  book: BookWithRelations
  onCollapse: () => void
}) {
  const dispatch = useAppDispatch()
  const track = useAppSelector(selectCurrentTrack)
  const mode = useAppSelector(selectReadingMode)
  const t = useTranslation("Reader.miniPlayer")

  return (
    <div className="flex flex-col">
      <FloatingCardHeader>
        <TooltipButton
          variant="ghost"
          tooltip={t.plain("collapse")}
          aria-label={t.plain("collapseAria")}
          onClick={onCollapse}
        >
          <icon.ChevronDown />
        </TooltipButton>
        <FloatingCardTitle>
          <span className="truncate">{track?.title}</span>
        </FloatingCardTitle>
        <SpeedMenu book={book} />
        <TooltipButton
          variant="ghost"
          tooltip={t.plain("backToBook")}
          aria-label={t.plain("backToBook")}
          nativeButton={false}
          render={<V3Link href={`/books/${book.uuid}/read?mode=${mode}`} />}
        >
          <icon.ArrowUpRight />
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          tooltip={t.plain("stopListening")}
          aria-label={t.plain("stopListening")}
          onClick={() => dispatch(closeMiniPlayer())}
        >
          <icon.Close />
        </TooltipButton>
      </FloatingCardHeader>
      <FloatingCardBody>
        <FloatingCardMedia>
          <Cover book={book} width={56} interactive={false} />
        </FloatingCardMedia>
        <FloatingCardContent>
          <p className="font-heading truncate text-sm font-semibold">
            {book.title}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {book.authors.map((author) => author.name).join(", ")}
          </p>
        </FloatingCardContent>
        <div className="flex items-center">
          <PlayerControls />
        </div>
      </FloatingCardBody>
      <FloatingCardFooter>
        <SeekBar />
      </FloatingCardFooter>
    </div>
  )
}

function SeekBar() {
  const dispatch = useAppDispatch()
  const t = useTranslation("Reader.miniPlayer")
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
        aria-label={t.plain("positionInTrack")}
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
