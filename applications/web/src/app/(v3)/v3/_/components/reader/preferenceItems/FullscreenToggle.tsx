import * as icon from "@/icons"

import { ToolbarIcon } from "./ToolbarIcon"

export const FullscreenToggle = ({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen: boolean
  onToggleFullscreen: () => void
}) => {
  return (
    <ToolbarIcon
      label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      icon={
        isFullscreen ? <icon.Minimize size="lg" /> : <icon.Maximize size="lg" />
      }
      onClick={onToggleFullscreen}
    />
  )
}
