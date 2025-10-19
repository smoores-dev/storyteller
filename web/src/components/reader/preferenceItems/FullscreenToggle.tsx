import { ActionIcon, Tooltip } from "@mantine/core"
import { IconMaximize, IconMinimize } from "@tabler/icons-react"

export const FullscreenToggle = ({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen: boolean
  onToggleFullscreen: () => void
}) => {
  return (
    <Tooltip label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
      <ActionIcon
        variant="subtle"
        size="lg"
        onClick={onToggleFullscreen}
        className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover"
      >
        {isFullscreen ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
      </ActionIcon>
    </Tooltip>
  )
}
