"use client"

import { type Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { type Hotkey } from "@tanstack/react-hotkeys"
import { type VariantProps } from "class-variance-authority"

import { Button, type buttonVariants } from "./button"
import { KeyboardShortcut } from "./kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

type TooltipButtonProps = React.ComponentProps<typeof Button> &
  VariantProps<typeof buttonVariants> & {
    tooltip: React.ReactNode
    tooltipSide?: TooltipPrimitive.Positioner.Props["side"]
    tooltipAlign?: TooltipPrimitive.Positioner.Props["align"]
    delay?: number
    "aria-label": string
    tooltipClassName?: string
    shortcut?: Hotkey[]
  }

export function TooltipButton({
  tooltip,
  tooltipSide,
  tooltipAlign,
  tooltipClassName,
  shortcut,
  delay,
  ...buttonProps
}: TooltipButtonProps) {
  return (
    <Tooltip delay={delay}>
      <TooltipTrigger render={<Button size="icon-sm" {...buttonProps} />} />
      <TooltipContent
        side={tooltipSide}
        align={tooltipAlign}
        className={tooltipClassName}
      >
        {tooltip}
        {shortcut && <KeyboardShortcut shortcut={shortcut} className="ml-2" />}
      </TooltipContent>
    </Tooltip>
  )
}
