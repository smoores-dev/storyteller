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
      label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
      icon={
        isFullscreen ? <icon.Minimize size="lg" /> : <icon.Maximize size="lg" />
      }
      onClick={onToggleFullscreen}
      className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover"
    />
  )
}
