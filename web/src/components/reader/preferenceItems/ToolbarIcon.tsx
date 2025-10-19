import { ActionIcon, Tooltip } from "@mantine/core"

import { type UUID } from "@/uuid"

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

export type ToolProps =
  | {
      mode: "dropdown" | "raw"
    }
  | {
      mode: "drawer"
      openDrawer: (content: DrawerContentType, title: string) => void
    }

export const ToolbarIcon = ({
  label,
  icon,
  onClick,
  ref,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  /* for popover target */
  ref?: React.RefObject<HTMLButtonElement>
}) => {
  return (
    <Tooltip label={label}>
      <ActionIcon
        ref={ref}
        variant="subtle"
        size="lg"
        className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover flex items-center justify-center"
        onClick={onClick}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  )
}
