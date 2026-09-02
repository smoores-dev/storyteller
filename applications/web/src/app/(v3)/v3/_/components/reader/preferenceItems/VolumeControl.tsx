"use client"

import { useState } from "react"

import { useMenuToggle } from "@v3/_/components/reader/hooks/useMenuToggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { readerPlayer } from "@/services/AudioPlayerService"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectVolume } from "@/store/slices/audioPlayerSlice"
import { preferencesSlice } from "@/store/slices/preferencesSlice"

import { ReaderSlider } from "./ReaderSlider"
import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import { readerMenuClassName, stopMenuNavigation } from "./readerSettingsRows"

const VolumeSlider = () => {
  const volume = useAppSelector(selectVolume)
  const dispatch = useAppDispatch()
  const [draft, setDraft] = useState<number | null>(null)

  return (
    <div className="p-2" onKeyDown={stopMenuNavigation}>
      <ReaderSlider
        value={draft ?? volume}
        onValueChange={(value) => {
          setDraft(value)
        }}
        onValueCommitted={(value) => {
          setDraft(null)
          const snapped =
            value <= 1.5 ? 0 : value >= 98.5 ? 100 : Math.round(value)
          readerPlayer().setVolume(snapped)
          dispatch(
            preferencesSlice.actions.updatePreference({
              key: "volume",
              value: snapped,
              target: "global",
            }),
          )
        }}
        min={0}
        max={100}
        step={0.01}
        marks={[
          { value: 0, label: "0%" },
          { value: 100, label: "100%" },
        ]}
      />
    </div>
  )
}

export const VolumeControl = (props: ToolProps) => {
  const { isOpen, openMenu, closeMenu } = useMenuToggle()
  const volume = useAppSelector(selectVolume)

  const volumeIcon = volume === 0 ? <icon.VolumeOff /> : <icon.Volume />

  if (props.mode === "raw") {
    return <VolumeSlider />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label="Volume"
        icon={volumeIcon}
        onClick={() => {
          props.openDrawer({ type: "volume" }, "Volume")
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
        render={<ToolbarIcon label="Volume" icon={volumeIcon} />}
      />
      <DropdownMenuContent
        align="end"
        className={cn(readerMenuClassName, "w-60")}
      >
        <VolumeSlider />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

VolumeControl.DrawerContent = VolumeSlider
