"use client"

import { type CSSProperties, type ReactNode } from "react"

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
  icon?: string | null
  color?: string | null
}

export type RelationChipDecoration = {
  className?: string
  style?: CSSProperties
  prefix?: ReactNode
}

type RelationItem = RelationChipItem

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
  decoration,
  label,
}: {
  item: RelationItem
  badgeVariant: "outline" | "secondary"
  canInteract: boolean
  onRemoveItem: (item: RelationItem) => void
  renderBadgeExtra?: (item: RelationItem) => ReactNode
  decoration?: RelationChipDecoration | undefined
  label: string
}) => {
  const base = (
    <>
      {decoration?.prefix}
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
          className="text-muted-foreground/50 hover:text-foreground group-hover/badge:text-muted-foreground -mr-0.5 ml-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full transition-colors"
        >
          <icon.Close className="size-3" />
        </button>
      )}
    </>
  )

  const shape = cn(
    "group/badge h-6 gap-1 rounded-full px-2.5 text-xs font-normal",
    canInteract && "pr-1.5",
    decoration?.className,
  )

  if (item.url) {
    return (
      <Badge
        variant={badgeVariant}
        className={shape}
        style={decoration?.style}
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
    <Badge variant={badgeVariant} className={shape} style={decoration?.style}>
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
  decorate?: ((item: T) => RelationChipDecoration) | undefined
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
  decorate,
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
          decoration={decorate?.(item)}
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
  return (
    <TooltipButton
      {...props}
      tooltip={tooltip ?? c.plain("actions.add")}
      aria-label={ariaLabel ?? c.plain("actions.add")}
      variant={variant ?? "ghost"}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:border-foreground/40 size-6 rounded-full border border-dashed p-0",
        className,
      )}
    >
      <icon.Add className="size-3.5" />
    </TooltipButton>
  )
}
