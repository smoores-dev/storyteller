import {
  type Hotkey,
  type IndividualKey,
  type Modifier,
  formatForDisplay,
  resolveModifier,
  useKeyHold,
} from "@tanstack/react-hotkeys"
import React from "react"

import { cn } from "@v3/_/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-muted text-muted-foreground [[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10 pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-xs! px-1 font-sans text-[0.625rem] font-medium select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }

export function KeyboardShortcut({
  shortcut,
  ...props
}: { shortcut: Hotkey[] } & React.ComponentProps<typeof KbdGroup>) {
  return (
    <KbdGroup {...props}>
      {shortcut.map((key) => {
        const keys = key.split("+")
        return keys.map((key) => {
          return <HeldKbd key={key} modifier={key as IndividualKey} />
        })
      })}
    </KbdGroup>
  )
}

export function HeldKbd({ modifier }: { modifier: IndividualKey | Modifier }) {
  const isHeld = useKeyHold(
    (modifier === "Mod"
      ? resolveModifier(modifier)
      : modifier) as IndividualKey,
  )

  return (
    <Kbd className={cn(isHeld && "opacity-50")}>
      {formatForDisplay(modifier)}
    </Kbd>
  )
}
