"use client"

import { type ComponentProps } from "react"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { cn } from "@v3/_/lib/utils"

import { type UUID } from "@/uuid"

export type DrawerContentType =
  | {
      type: "reading-settings"
      bookUuid: UUID
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

type ToolbarIconProps = Omit<
  ComponentProps<typeof TooltipButton>,
  "tooltip" | "aria-label" | "children"
> & {
  label: string
  icon: React.ReactNode
  pressed?: boolean
}

export const ToolbarIcon = ({
  className,
  label,
  icon,
  pressed,
  ...props
}: ToolbarIconProps) => {
  return (
    <TooltipButton
      variant="real-ghost"
      size="icon-lg"
      {...props}
      tooltip={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover focus-visible:border-reader-accent/40 focus-visible:ring-reader-accent/40 aria-expanded:bg-reader-surface-hover aria-expanded:text-reader-accent aria-pressed:bg-reader-surface-hover aria-pressed:text-reader-accent flex items-center justify-center",
        className,
      )}
    >
      {icon}
    </TooltipButton>
  )
}
