import { useCallback, useState } from "react"
import { Drawer } from "vaul"

import { type BookWithRelations } from "@/database/books"
import { useAppSelector } from "@/store/appState"
import { selectVolume } from "@/store/slices/audioPlayerSlice"
import {
  selectCurrentBook,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"
import { type UUID } from "@/uuid"

import { useScreenSize } from "./hooks/useScreenSize"
import { FullscreenToggle } from "./preferenceItems/FullscreenToggle"
import { PlaybackSpeedControl } from "./preferenceItems/PlaybackSpeedControl"
import { ReadaloudSyncingToggle } from "./preferenceItems/ReadaloudSyncingToggle"
import { ReadingSettingsControl } from "./preferenceItems/ReadingSettingsControl"
import { SleepTimerItem } from "./preferenceItems/SleepTimerControl"
import { TableOfContentsControl } from "./preferenceItems/TableOfContentsControl"
import { VolumeControl } from "./preferenceItems/VolumeControl"

type DrawerContentType =
  | {
      type: "reading-settings"
      scope: "global" | UUID
    }
  | {
      type: "sleep-timer"
    }
  | {
      type: "playback-speed"
    }
  | {
      type: "table-of-contents"
    }
  | {
      type: "volume"
    }

type Props = {
  book: BookWithRelations
  context: "reader" | "miniplayer"
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  className?: string
}

export const ResponsiveSettingsControls = ({
  book,
  context,
  isFullscreen,
  onToggleFullscreen,
}: Props) => {
  const mode = useAppSelector(selectReadingMode)
  const currentBook = useAppSelector(selectCurrentBook)

  const { isMobile } = useScreenSize()

  const [drawerContent, setDrawerContent] = useState<{
    content: DrawerContentType
    title: string
  } | null>(null)

  const openDrawer = useCallback(
    (content: DrawerContentType, title: string) => {
      setDrawerContent({ content, title })
    },
    [],
  )

  const iconMode =
    isMobile && context === "reader"
      ? { mode: "drawer" as const, openDrawer }
      : { mode: "dropdown" as const }

  const shouldShowReadaloudSyncingToggle = context === "reader"
  const shouldShowSleepTimerControl = mode !== "epub"
  const shouldShowReadingSettingsControl =
    mode !== "audiobook" && context === "reader"
  const shouldShowPlaybackSpeedControl = mode !== "epub"
  const volume = useAppSelector(selectVolume)
  const shouldShowVolumeControl =
    (mode === "audiobook" || book.readaloud) &&
    // if somehow you have managed to set the volume to eg 0.5 on a device that's detected as mobile, we still want to show the volume control so you can fix it
    (!isMobile || volume !== 100)

  const shouldShowFullscreenToggle =
    mode !== "audiobook" &&
    isFullscreen !== undefined &&
    onToggleFullscreen &&
    !isMobile

  return (
    <>
      <div className="flex items-center gap-2">
        {shouldShowReadaloudSyncingToggle && <ReadaloudSyncingToggle />}

        {shouldShowReadingSettingsControl && (
          <ReadingSettingsControl
            {...iconMode}
            scope={currentBook?.uuid ?? "global"}
          />
        )}
        {shouldShowSleepTimerControl && <SleepTimerItem {...iconMode} />}
        {shouldShowPlaybackSpeedControl && (
          <PlaybackSpeedControl {...iconMode} />
        )}

        <TableOfContentsControl {...iconMode} />

        {shouldShowVolumeControl && <VolumeControl {...iconMode} />}
        {shouldShowFullscreenToggle && (
          <FullscreenToggle
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        )}
      </div>
      <Drawer.Root
        onOpenChange={(open) => {
          if (!open) {
            setDrawerContent(null)
          }
        }}
        open={drawerContent !== null}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[200] bg-black/40" />
          <Drawer.Content className="bg-reader-surface fixed bottom-0 left-0 right-0 z-[200] flex max-h-[65svh] flex-col rounded-t-2xl">
            <div className="bg-reader-border mx-auto mt-6 h-2 w-12 shrink-0 rounded-full" />
            <Drawer.Title className="text-reader-text font-heading p-4 text-2xl font-bold">
              {drawerContent?.title}
            </Drawer.Title>
            <div className="overflow-x-clip overflow-y-scroll px-4 py-4">
              {drawerContent?.content.type === "reading-settings" && (
                <ReadingSettingsControl.DrawerContent
                  scope={drawerContent.content.scope}
                />
              )}
              {drawerContent?.content.type === "sleep-timer" && (
                <SleepTimerItem.DrawerContent />
              )}
              {drawerContent?.content.type === "playback-speed" && (
                <PlaybackSpeedControl.DrawerContent />
              )}
              {drawerContent?.content.type === "table-of-contents" && (
                <TableOfContentsControl.DrawerContent />
              )}
              {drawerContent?.content.type === "volume" && (
                <VolumeControl.DrawerContent />
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
