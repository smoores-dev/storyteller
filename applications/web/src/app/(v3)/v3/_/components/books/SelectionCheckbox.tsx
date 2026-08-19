"use client"

import { type MouseEvent } from "react"

import { Checkbox } from "@v3/_/components/ui/checkbox"

import { cn } from "@/cn"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

export function SelectionCheckbox({
  uuid,
  checked,
  isSelecting,
  onToggle,
  onSelectRange,
  className,
  showCheckbox = true,
}: {
  uuid: UUID
  checked: boolean
  isSelecting: boolean
  onToggle: (uuid: UUID) => void
  onSelectRange?: (uuid: UUID, orderedUuids?: UUID[]) => void
  className?: string
  showCheckbox?: boolean
}) {
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (e.shiftKey && onSelectRange) {
      window.getSelection()?.empty()
      onSelectRange(uuid)
      return
    }

    onToggle(uuid)
  }

  return (
    <div
      className={cn(
        "transition-opacity",
        !checked &&
          !isSelecting &&
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        className,
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Select book"
    >
      <Checkbox
        onClick={(e) => {
          e.stopPropagation()
        }}
        checked={checked}
        tabIndex={-1}
        className={cn(
          "hover:border-primary bg-background size-5 cursor-pointer rounded-full border-2 shadow-sm transition-colors data-checked:border-2",

          !showCheckbox && "[&_svg]:hidden",
        )}
      />
    </div>
  )
}

export function SelectionBullet({
  selected,
  indeterminate = false,
  className,
}: {
  selected: boolean
  indeterminate?: boolean
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "border-input hover:border-primary bg-background flex size-5 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
        (selected || indeterminate) &&
          "bg-primary border-primary text-primary-foreground",
        className,
      )}
    >
      {selected ? (
        <icon.Check className="size-3.5" />
      ) : indeterminate ? (
        <icon.Minus className="size-3.5" />
      ) : null}
    </div>
  )
}
