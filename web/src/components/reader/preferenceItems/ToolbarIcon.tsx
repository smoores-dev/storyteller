import { ActionIcon, Tooltip } from "@mantine/core"

import { cn } from "@/cn"
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
      targetDocument?: Document
    }
  | {
      mode: "drawer"
      openDrawer: (content: DrawerContentType, title: string) => void
    }

export const ToolbarIcon = ({
  className,
  label,
  icon,
  onClick,
  ref,
  targetDocument = window.document,
}: {
  label: string
  icon: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  /* for popover target */
  ref?: React.RefObject<HTMLButtonElement>
  className?: string
  targetDocument?: Document
}) => {
  return (
    <Tooltip
      withArrow
      classNames={{
        tooltip: "bg-reader-surface-hover text-reader-text",
      }}
      label={label}
      portalProps={{ target: targetDocument.body }}
    >
      <ActionIcon
        ref={ref}
        variant="subtle"
        size="lg"
        className={cn(
          "text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover flex items-center justify-center",
          className,
        )}
        onClick={onClick}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  )
}
