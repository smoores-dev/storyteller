import { Popover, Slider, Text } from "@mantine/core"
import { IconMinus, IconPlus } from "@tabler/icons-react"

import { useMenuToggle } from "@/components/reader/hooks/useMenuToggle"
import { AudioPlayer } from "@/services/AudioPlayerService"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectPlaybackRate } from "@/store/slices/audioPlayerSlice"
import {
  preferencesSlice,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import { selectCurrentBook } from "@/store/slices/readingSessionSlice"

import { ResetOrSetGlobalButton } from "./ReadingSettingsControl"
import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import { popoverClassNames, sliderClassNames } from "./classNames"

type Props = ToolProps

const SpeedControl = () => {
  const playbackSpeed = useAppSelector(selectPlaybackRate)
  const globalPlaybackSpeed = useAppSelector((state) =>
    selectPreference(state, "playbackSpeed", true),
  )
  const currentBook = useAppSelector(selectCurrentBook)
  const dispatch = useAppDispatch()

  return (
    <div className="flex flex-col items-center justify-center gap-5 px-0 py-2">
      <ResetOrSetGlobalButton
        preference={{
          key: "playbackSpeed",
          value: playbackSpeed,
          globalValue: globalPlaybackSpeed,
        }}
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        scope={currentBook!.uuid}
      >
        <div className="grid w-full grid-cols-5 gap-2 px-8">
          {[1, 1.25, 1.5, 1.75, 2].map((speed) => (
            <button
              key={speed}
              onClick={() => {
                if (!currentBook) return

                AudioPlayer.setPlaybackRate(speed)
                dispatch(
                  preferencesSlice.actions.updatePreference({
                    key: "playbackSpeed",
                    value: speed,
                    target: currentBook.uuid,
                  }),
                )
              }}
              className={`rounded-lg border px-3 py-2 text-center transition-all ${
                Math.abs(playbackSpeed - speed) < 0.01
                  ? "border-reader-accent bg-reader-accent/10 text-reader-accent shadow-sm"
                  : "border-reader-border bg-reader-bg text-reader-text hover:border-reader-accent/50 hover:bg-reader-surface-hover"
              }`}
            >
              <Text size="sm" className="text-center font-medium">
                {speed}x
              </Text>
            </button>
          ))}
        </div>
      </ResetOrSetGlobalButton>

      <div className="flex w-full items-end gap-2">
        <button
          className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative mb-1.5 rounded-full bg-transparent p-1.5"
          onClick={() => {
            if (!currentBook) return
            AudioPlayer.setPlaybackRate(playbackSpeed - 0.1)
            dispatch(
              preferencesSlice.actions.incrementPlaybackRate({
                target: currentBook.uuid,
                value: -0.1,
              }),
            )
          }}
        >
          <IconMinus size={16} />
        </button>
        <Slider
          defaultValue={playbackSpeed}
          classNames={sliderClassNames}
          value={playbackSpeed}
          onChange={(value) => {
            if (!currentBook) return

            AudioPlayer.setPlaybackRate(value)
            dispatch(
              preferencesSlice.actions.updatePreference({
                key: "playbackSpeed",
                value,
                target: currentBook.uuid,
              }),
            )
          }}
          label={null}
          min={0.5}
          max={4}
          step={0.1}
          className="w-full"
          marks={[
            { value: 0.5, label: "0.5x" },
            { value: 1, label: "1.0x" },
            { value: 2, label: "2.0x" },
            { value: 4, label: "4.0x" },
          ]}
        />
        <button
          className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative mb-1.5 rounded-full bg-transparent p-1.5"
          onClick={() => {
            if (!currentBook) return
            AudioPlayer.setPlaybackRate(playbackSpeed + 0.1)
            dispatch(
              preferencesSlice.actions.incrementPlaybackRate({
                target: currentBook.uuid,
                value: 0.1,
              }),
            )
          }}
        >
          <IconPlus size={16} />
        </button>
      </div>
    </div>
  )
}

export const PlaybackSpeedControl = (props: Props) => {
  const playbackSpeed = useAppSelector(selectPlaybackRate)

  const { isOpen, closeMenu, toggleMenu } = useMenuToggle()

  if (props.mode === "raw") {
    return <SpeedControl />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label="Playback Speed"
        icon={
          <span suppressHydrationWarning className="text-xs">
            {playbackSpeed}x
          </span>
        }
        onClick={() => {
          props.openDrawer({ type: "playback-speed" }, "Playback Speed")
        }}
      />
    )
  }

  return (
    <Popover
      withArrow
      opened={isOpen}
      onDismiss={closeMenu}
      classNames={popoverClassNames}
      // withinPortal={false}
      portalProps={{
        target: props.targetDocument?.body ?? window.document.body,
      }}
    >
      <Popover.Target>
        <ToolbarIcon
          targetDocument={props.targetDocument ?? window.document}
          label="Playback Speed"
          icon={
            <span suppressHydrationWarning className="text-xs">
              {playbackSpeed}x
            </span>
          }
          onClick={toggleMenu}
        />
      </Popover.Target>
      <Popover.Dropdown className="w-80">
        <SpeedControl />
      </Popover.Dropdown>
    </Popover>
  )
}

PlaybackSpeedControl.DrawerContent = SpeedControl
