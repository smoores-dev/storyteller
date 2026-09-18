import { useReaderShortcuts } from "@v3/_/components/reader/hooks/useReaderKeyboard"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"

import { ToolbarIcon } from "./ToolbarIcon"

export const FullscreenToggle = ({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen: boolean
  onToggleFullscreen: () => void
}) => {
  const shortcuts = useReaderShortcuts()
  const t = useTranslation("Reader.fullscreen")
  return (
    <ToolbarIcon
      label={isFullscreen ? t("exitFullscreen") : t("title")}
      shortcut={[shortcuts.fullscreen]}
      pressed={isFullscreen}
      icon={
        isFullscreen ? <icon.Minimize size="lg" /> : <icon.Maximize size="lg" />
      }
      onClick={onToggleFullscreen}
    />
  )
}
