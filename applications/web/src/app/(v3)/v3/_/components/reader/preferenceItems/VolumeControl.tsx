import { IconVolume, IconVolumeOff } from "@tabler/icons-react"
import classNames from "classnames"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/dropdown-menu"
import { useMenuToggle } from "@/components/reader/hooks/useMenuToggle"
import { readerPlayer } from "@/services/AudioPlayerService"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectVolume } from "@/store/slices/audioPlayerSlice"
import { preferencesSlice } from "@/store/slices/preferencesSlice"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import { popoverClassNames, sliderClassNames } from "./classNames"
import { Slider } from "@/app/(v3)/v3/_/components/ui/slider"
import { ReaderSlider } from "./ReaderSlider"

const snapVolume = (value: number): number => {
  // snap to 0 if very close to 0
  if (value <= 1.5) return 0

  // snap to 100 if very close to 100
  if (value >= 98.5) return 100

  // round to whole number
  return Math.round(value)
}

const VolumeSlider = () => {
  const volume = useAppSelector(selectVolume)
  const dispatch = useAppDispatch()

  return (
    <div className="p-2">
      <ReaderSlider
        // classNames={{ ...sliderClassNames, root: "md:pb-0" }}
        size="sm"
        // thumbSize={10}
        defaultValue={volume}
        onValueCommitted={(value) => {
          const snappedValue = snapVolume(value)
          readerPlayer().setVolume(snappedValue)
          dispatch(
            preferencesSlice.actions.updatePreference({
              key: "volume",
              value: snappedValue,
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
        label={(value) => `${Math.round(value)}%`}
      />
    </div>
  )
}

export const VolumeControl = (props: ToolProps) => {
  const { isOpen, closeMenu, toggleMenu } = useMenuToggle()
  const volume = useAppSelector(selectVolume)
  const isMuted = volume === 0

  const volumeIcon = isMuted ? (
    <IconVolumeOff size={18} />
  ) : (
    <IconVolume size={18} />
  )

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
    <DropdownMenu //open={isOpen} onOpenChange={toggleMenu}
    >
      <DropdownMenuTrigger
        render={
          <ToolbarIcon
            label="Volume"
            icon={volumeIcon}
            onClick={(e) => {
              toggleMenu()
            }}
          />
        }
      />
      <DropdownMenuContent className="w-60">
        <VolumeSlider />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

VolumeControl.DrawerContent = VolumeSlider
