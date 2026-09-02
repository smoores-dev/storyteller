"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import {
  pauseButtonPressed,
  playButtonPressed,
  skipPartButtonHeld,
  skipPartButtonPressed,
} from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectError,
  selectIsLoading,
  selectIsPlaying,
} from "@/store/slices/audioPlayerSlice"

const HOLD_MS = 800

export function PlayerControls({ tooltips = true }: { tooltips?: boolean }) {
  const dispatch = useAppDispatch()
  const loading = useAppSelector(selectIsLoading)
  const playing = useAppSelector(selectIsPlaying)
  const error = useAppSelector(selectError)
  const t = useTranslation("Reader")
  const playLabel = t.plain(
    loading
      ? "toolbar.buffering"
      : error
        ? "miniPlayer.playbackError"
        : playing
          ? "toolbar.pause"
          : "toolbar.play",
  )

  return (
    <>
      <SkipButton direction="previous" tooltips={tooltips} />
      <TransportButton
        tooltips={tooltips}
        label={playLabel}
        size="icon-lg"
        className="mx-0.5 rounded-full"
        onClick={() =>
          dispatch(playing ? pauseButtonPressed() : playButtonPressed())
        }
      >
        {loading ? (
          <icon.Loader size="lg" className="animate-spin" />
        ) : error ? (
          <icon.AlertCircle size="lg" />
        ) : playing ? (
          <icon.PlayerPauseFilled size="lg" />
        ) : (
          <icon.PlayerPlayFilled size="lg" />
        )}
      </TransportButton>
      <SkipButton direction="next" tooltips={tooltips} />
    </>
  )
}

function SkipButton({
  direction,
  tooltips,
}: {
  direction: "previous" | "next"
  tooltips: boolean
}) {
  const dispatch = useAppDispatch()
  const t = useTranslation("Reader.miniPlayer")
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  return (
    <TransportButton
      tooltips={tooltips}
      label={t.plain(
        holding
          ? direction === "previous"
            ? "previousChapter"
            : "nextChapter"
          : direction === "previous"
            ? "back15"
            : "forward15",
      )}
      variant="ghost"
      size="icon"
      className="relative overflow-hidden rounded-full"
      onPointerDown={() => {
        held.current = false
        setHolding(true)
        timer.current = setTimeout(() => {
          held.current = true
          setHolding(false)
          dispatch(skipPartButtonHeld({ direction, context: "miniplayer" }))
        }, HOLD_MS)
      }}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onClick={() => {
        if (held.current) {
          held.current = false
          return
        }
        dispatch(skipPartButtonPressed({ direction, context: "miniplayer" }))
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "bg-primary/20 pointer-events-none absolute inset-0 origin-bottom ease-linear",
          holding
            ? "scale-y-100 transition-transform duration-[800ms]"
            : "scale-y-0 transition-none",
        )}
      />
      {direction === "previous" ? (
        <icon.RewindBackward15 />
      ) : (
        <icon.RewindForward15 />
      )}
    </TransportButton>
  )
}

function TransportButton({
  tooltips,
  label,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "aria-label"> & {
  tooltips: boolean
  label: string
}) {
  if (!tooltips) return <Button aria-label={label} {...props} />
  return <TooltipButton tooltip={label} aria-label={label} {...props} />
}
