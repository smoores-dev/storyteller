"use client"

import { useCommon } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { TooltipButton } from "./tooltip-button"

export function ResetButton({
  onReset,
  tooltip,
  disabled = false,
  className,
}: {
  onReset: () => void
  tooltip?: string
  disabled?: boolean
  className?: string
}) {
  const c = useCommon()
  const label = tooltip ?? c.plain("actions.resetToDefaults")

  return (
    <TooltipButton
      variant="ghost"
      size="icon-xs"
      tooltip={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "text-muted-foreground hover:text-foreground size-5 shrink-0",
        disabled && "invisible",
        className,
      )}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onReset()
      }}
    >
      <icon.Rotate2 className="size-3.5" />
    </TooltipButton>
  )
}
