import { IconMaximize, IconMinimize } from "@tabler/icons-react"

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
        isFullscreen ? <IconMinimize size={18} /> : <IconMaximize size={18} />
      }
      onClick={onToggleFullscreen}
      className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover"
    />
  )
}
