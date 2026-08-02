"use client"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useCommon } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { RelationChipEditor, type RelationChipItem } from "./RelationChipEditor"

export function RelationDisplay({
  items,
  source,
  badgeVariant = "outline",
  emptyText,
  canEdit,
  onEdit,
  className,
}: {
  items: RelationChipItem[]
  source: "tags" | "collections" | "series" | "creators" | "statuses"
  badgeVariant?: "outline" | "secondary"
  emptyText: string
  canEdit: boolean
  onEdit: () => void
  className?: string
}) {
  const c = useCommon()

  return (
    <div className={cn("group/reldisplay relative pr-7", className)}>
      <RelationChipEditor
        items={items}
        badgeVariant={badgeVariant}
        source={source}
        editMode={false}
        emptyText={emptyText}
        canInteract={false}
        onRemoveItem={() => {}}
      />

      {canEdit && (
        <TooltipButton
          type="button"
          size="icon-sm"
          variant="real-ghost"
          className="text-muted-foreground hover:text-foreground absolute top-0 right-0 h-5 opacity-0 transition-opacity group-hover/reldisplay:opacity-100"
          onClick={onEdit}
          tooltip={c("actions.edit")}
          aria-label={c("actions.edit")}
        >
          <icon.Edit className="size-3.5 stroke-[1.5]" />
        </TooltipButton>
      )}
    </div>
  )
}
