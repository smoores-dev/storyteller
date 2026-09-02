"use client"

import { useState } from "react"

import { useMenuToggle } from "@v3/_/components/reader/hooks/useMenuToggle"
import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { readerPlayer } from "@/services/AudioPlayerService"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectPlaybackRate } from "@/store/slices/audioPlayerSlice"
import { preferencesSlice } from "@/store/slices/preferencesSlice"
import { selectCurrentBook } from "@/store/slices/readingSessionSlice"


import { ReaderSlider } from "./ReaderSlider"
import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import { readerMenuClassName, stopMenuNavigation } from "./readerSettingsRows"

const MIN_SPEED = 0.5
const MAX_SPEED = 4
const PRESETS = [1, 1.25, 1.5, 1.75, 2]

const SpeedControl = () => {
  const playbackSpeed = useAppSelector(selectPlaybackRate)
  const currentBook = useAppSelector(selectCurrentBook)
  const dispatch = useAppDispatch()
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? playbackSpeed

  const t = useTranslation("Reader.playbackSpeed")

  const setSpeed = (value: number) => {
    if (!currentBook) return
    const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, value))
    readerPlayer().setPlaybackRate(speed)
    dispatch(
      preferencesSlice.actions.updatePreference({
        key: "playbackSpeed",
        value: speed,
        target: currentBook.uuid,
      }),
    )
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-5 px-0 py-2"
      onKeyDown={stopMenuNavigation}
    >
      <div className="grid w-full grid-cols-5 gap-2 px-8">
        {PRESETS.map((speed) => (
          <Button
            key={speed}
            variant="ghost"
            size="sm"
            onClick={() => {
              setSpeed(speed)
            }}
            className={cn(
              "rounded-lg border px-3 py-2 text-center transition-all",
              Math.abs(playbackSpeed - speed) < 0.01
                ? "border-reader-accent bg-reader-accent/10 text-reader-accent shadow-xs"
                : "border-reader-border bg-reader-bg text-reader-text hover:border-reader-accent/50 hover:bg-reader-surface-hover",
            )}
          >
            <span className="text-center text-[10px] font-medium">
              {speed}x
            </span>
          </Button>
        ))}
      </div>

      <div className="flex w-full items-end gap-2">
        <TooltipButton
          variant="ghost"
          size="sm"
          tooltip={t("slower")}
          aria-label={t("slower")}
          shortcut={[","]}
          className="text-reader-text hover:bg-reader-surface-hover relative mb-3 rounded-full p-1.5"
          onClick={() => {
            setSpeed(Math.round((playbackSpeed - 0.1) * 10) / 10)
          }}
        >
          <icon.Minus size="lg" />
        </TooltipButton>
        <div className="w-full grow">
          <ReaderSlider
            value={shown}
            className="**:data-[slot='slider-marks']:text-[10px]!"
            thumbAlignment="center"
            onValueChange={(value) => {
              setDraft(value)
            }}
            onValueCommitted={(value) => {
              setDraft(null)
              setSpeed(value)
            }}
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.1}
            marks={[
              { value: 0.5, label: "0.5x" },
              { value: 1, label: "1x" },
              { value: 2, label: "2x" },
              { value: 4, label: "4x" },
            ]}
          />
        </div>
        <TooltipButton
          variant="ghost"
          size="sm"
          tooltip={t("faster")}
          aria-label={t("faster")}
          shortcut={["."]}
          className="text-reader-text hover:bg-reader-surface-hover relative mb-3 rounded-full p-1.5"
          onClick={() => {
            setSpeed(Math.round((playbackSpeed + 0.1) * 10) / 10)
          }}
        >
          <icon.Plus size="lg" />
        </TooltipButton>
      </div>
    </div>
  )
}

export const PlaybackSpeedControl = (props: ToolProps) => {
  const playbackSpeed = useAppSelector(selectPlaybackRate)
  const { isOpen, openMenu, closeMenu } = useMenuToggle()

  const speedIcon = (
    <span suppressHydrationWarning className="text-xs">
      {playbackSpeed}x
    </span>
  )

  const t = useTranslation("Reader.playbackSpeed")

  if (props.mode === "raw") {
    return <SpeedControl />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label={t("title")}
        icon={speedIcon}
        onClick={() => {
          props.openDrawer({ type: "playback-speed" }, t("title"))
        }}
      />
    )
  }

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        if (open) openMenu()
        else closeMenu()
      }}
    >
      <DropdownMenuTrigger
        render={<ToolbarIcon label={t("title")} icon={speedIcon} />}
      />
      <DropdownMenuContent
        align="end"
        className={cn(readerMenuClassName, "w-96")}
      >
        <SpeedControl />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

PlaybackSpeedControl.DrawerContent = SpeedControl
