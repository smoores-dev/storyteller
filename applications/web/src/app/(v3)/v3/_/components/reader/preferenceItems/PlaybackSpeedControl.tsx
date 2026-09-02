import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/dropdown-menu"
import { Slider } from "@/app/(v3)/v3/_/components/ui/slider"
import { useMenuToggle } from "@/components/reader/hooks/useMenuToggle"
import * as icon from "@/icons"
import { readerPlayer } from "@/services/AudioPlayerService"
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
import { ReaderSlider } from "./ReaderSlider"
import { Button } from "../../ui/button"

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
            <Button
              key={speed}
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!currentBook) return

                readerPlayer().setPlaybackRate(speed)
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
                  ? "border-reader-accent bg-reader-accent/10 text-reader-accent shadow-xs"
                  : "border-reader-border bg-reader-bg text-reader-text hover:border-reader-accent/50 hover:bg-reader-surface-hover"
              }`}
            >
              <span className="text-center text-[10px] font-medium">
                {speed}x
              </span>
            </Button>
          ))}
        </div>
      </ResetOrSetGlobalButton>

      <div className="flex w-full items-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="relative mb-1.5 rounded-full p-1.5"
          onClick={() => {
            if (!currentBook) return
            readerPlayer().setPlaybackRate(playbackSpeed - 0.1)
            dispatch(
              preferencesSlice.actions.incrementPlaybackRate({
                target: currentBook.uuid,
                value: -0.1,
              }),
            )
          }}
        >
          <icon.Minus size="lg" />
        </Button>
        <div className="w-full grow">
          <ReaderSlider
            defaultValue={playbackSpeed}
            className="**:data-[slot='slider-marks']:text-[10px]!"
            thumbAlignment="center"
            onValueCommitted={(value) => {
              if (!currentBook) return

              readerPlayer().setPlaybackRate(value)
              dispatch(
                preferencesSlice.actions.updatePreference({
                  key: "playbackSpeed",
                  value,
                  target: currentBook.uuid,
                }),
              )
            }}
            min={0.5}
            max={4}
            step={0.1}
            marks={[
              { value: 0.5, label: "0.5x" },
              { value: 1, label: "1x" },
              { value: 2, label: "2x" },
              { value: 4, label: "4x" },
            ]}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="relative mb-1.5 rounded-full p-1.5"
          onClick={() => {
            if (!currentBook) return
            readerPlayer().setPlaybackRate(playbackSpeed + 0.1)
            dispatch(
              preferencesSlice.actions.incrementPlaybackRate({
                target: currentBook.uuid,
                value: 0.1,
              }),
            )
          }}
        >
          <icon.Plus size="lg" />
        </Button>
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
    <DropdownMenu open={isOpen} onOpenChange={toggleMenu}>
      <DropdownMenuTrigger
        render={
          <ToolbarIcon
            label="Playback Speed"
            icon={
              <span suppressHydrationWarning className="text-xs">
                {playbackSpeed}x
              </span>
            }
            onClick={toggleMenu}
          />
        }
      />
      <DropdownMenuContent className="w-96">
        <SpeedControl />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

PlaybackSpeedControl.DrawerContent = SpeedControl
