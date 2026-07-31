"use client"

import { type ReactNode } from "react"

import { Badge } from "@v3/_/components/ui/badge"
import { DynamicIcon } from "@v3/_/components/ui/dynamic-icon"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { V3Link } from "@/app/(v3)/v3/_/components/v3-link"
import * as icon from "@/icons"

export type RelationChipItem = {
  uuid: string
  name: string
  url?: string
  // optional icon id (resolved via DynamicIcon) and color, e.g. for tags/collections
  icon?: string | null
  color?: string | null
}

type RelationItem = RelationChipItem

// the icon (or a color dot fallback) shown at the start of an item, when set
export const RelationGlyph = ({ item }: { item: RelationItem }) => {
  if (item.icon) {
    return (
      <DynamicIcon iconId={item.icon} color={item.color} className="h-3 w-3" />
    )
  }
  if (item.color) {
    return (
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: item.color }}
      />
    )
  }
  return null
}

const RelationChip = ({
  item,
  badgeVariant,
  canInteract,
  onRemoveItem,
  renderBadgeExtra,
  label,
}: {
  item: RelationItem
  badgeVariant: "outline" | "secondary"
  canInteract: boolean
  onRemoveItem: (item: RelationItem) => void
  renderBadgeExtra?: (item: RelationItem) => ReactNode
  label: string
}) => {
  const base = (
    <>
      <RelationGlyph item={item} />
      <span className="truncate">{item.name}</span>
      {renderBadgeExtra?.(item)}

      {canInteract && (
        <button
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemoveItem(item)
          }}
          // inline (not absolute) so it never overlaps the label or shifts
          // layout on hover; dimmed at rest, solid when the chip is hovered.
          className="text-muted-foreground/50 hover:text-foreground group-hover/badge:text-muted-foreground -mr-0.5 ml-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full transition-colors"
        >
          <icon.Close className="size-3" />
        </button>
      )}
    </>
  )

  const shape = "group/badge h-6 gap-1 rounded-full px-2.5 text-xs font-normal"

  if (item.url) {
    return (
      <Badge
        variant={badgeVariant}
        className={cn(shape, canInteract && "pr-1.5")}
        render={
          <V3Link
            href={item.url}
            className="hover:text-primary hover:underline has-[button:hover]:no-underline"
          >
            {base}
          </V3Link>
        }
      />
    )
  }
  return (
    <Badge
      variant={badgeVariant}
      className={cn(shape, canInteract && "pr-1.5")}
    >
      {base}
    </Badge>
  )
}

type RelationChipEditorProps<T extends RelationItem> = {
  items: T[]
  badgeVariant?: "outline" | "secondary"
  source: "tags" | "collections" | "series" | "creators" | "statuses"

  editMode: boolean
  emptyText: string

  onRemoveItem: (item: T) => void | Promise<void>
  renderBadgeExtra?: (item: T) => ReactNode
  children?: ReactNode
  canInteract: boolean
  className?: string
}

export function RelationChipEditor<T extends RelationItem>({
  items,
  badgeVariant = "outline",
  emptyText,
  source,
  onRemoveItem,
  renderBadgeExtra,
  children,
  canInteract,
  className,
}: RelationChipEditorProps<T>) {
  const tLabels = useTranslation("Labels")

  return (
    <div
      className={cn(
        `group/${source}`,
        "flex flex-wrap items-center gap-1.5",
        className,
      )}
    >
      {items.map((item, idx) => (
        <RelationChip
          key={`${item.uuid}-${idx}`}
          item={item}
          badgeVariant={badgeVariant}
          canInteract={canInteract}
          onRemoveItem={() => void onRemoveItem(item)}
          renderBadgeExtra={
            renderBadgeExtra as (item: RelationItem) => ReactNode
          }
          label={tLabels("delete.withInput", { input: item.name })}
        />
      ))}

      {items.length === 0 && (
        <span className="text-muted-foreground text-sm">{emptyText}</span>
      )}

      {children}
    </div>
  )
}

export function RelationAddButton({
  tooltip,
  ariaLabel,
  variant,
  className,
  ...props
}: {
  tooltip?: string
  ariaLabel?: string
  variant?: "ghost" | "outline" | "secondary" | "destructive"
  className?: string
} & Omit<
  React.ComponentProps<typeof TooltipButton>,
  "tooltip" | "aria-label" | "variant" | "className"
>) {
  const c = useCommon()
  // spread `props` first so a menu trigger's injected handlers/ref (base-ui
  // Popover.Trigger `render`) reach the underlying button; without this the
  // add menu never opens.
  return (
    <TooltipButton
      {...props}
      tooltip={tooltip ?? c.plain("actions.add")}
      aria-label={ariaLabel ?? c.plain("actions.add")}
      variant={variant ?? "ghost"}
      // a dashed pill sized like the chips, so "add" reads as another slot in
      // the row rather than a detached icon button.
      className={cn(
        "text-muted-foreground hover:text-foreground hover:border-foreground/40 size-6 rounded-full border border-dashed p-0",
        className,
      )}
    >
      <icon.Add className="size-3.5" />
    </TooltipButton>
  )
}
