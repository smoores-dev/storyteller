import { Popover, Slider } from "@mantine/core"
import { IconVolume, IconVolumeOff } from "@tabler/icons-react"
import classNames from "classnames"

import { useMenuToggle } from "@/components/reader/hooks/useMenuToggle"
import { AudioPlayer } from "@/services/AudioPlayerService"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectVolume } from "@/store/slices/audioPlayerSlice"
import { preferencesSlice } from "@/store/slices/preferencesSlice"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import { popoverClassNames, sliderClassNames } from "./classNames"

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
      <Slider
        classNames={{ ...sliderClassNames, root: "md:pb-0" }}
        size="sm"
        thumbSize={10}
        defaultValue={volume}
        onChangeEnd={(value) => {
          const snappedValue = snapVolume(value)
          AudioPlayer.setVolume(snappedValue)
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
    <Popover
      width={200}
      position="top"
      withArrow
      shadow="md"
      opened={isOpen}
      onDismiss={closeMenu}
      classNames={{
        ...popoverClassNames,
        ...classNames,
      }}
      portalProps={{
        target: props.targetDocument?.body ?? window.document.body,
      }}
    >
      <Popover.Target>
        <ToolbarIcon
          targetDocument={props.targetDocument ?? window.document}
          label="Volume"
          icon={volumeIcon}
          onClick={toggleMenu}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <VolumeSlider />
      </Popover.Dropdown>
    </Popover>
  )
}

VolumeControl.DrawerContent = VolumeSlider
