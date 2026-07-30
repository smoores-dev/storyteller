"use client"

import { useRouter } from "next/navigation"

import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/filterable-menu"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { type BookWithRelations } from "@/database/books"
import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"

import {
  ActionEntryList,
  type BookActionEntry,
  useBookActionItems,
} from "./BookActionMenuItems"

export function BookActionsMenu({
  book,
  showOpenFullPage = false,
  onEdit,
  onDeleted,
  fullPageHref,
  className,
  open,
  onOpenChange,
}: {
  book: BookWithRelations
  showOpenFullPage?: boolean
  onEdit?: () => void
  // called after the book is deleted, so the panel/page can close or navigate
  onDeleted?: () => void
  fullPageHref?: string
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslation("BookActions")
  const c = useCommon()
  const router = useRouter()
  const canEdit = usePermission("bookUpdate")
  const { entries, dialogs } = useBookActionItems({
    books: [book],
    mode: "single",
    onAfterDestructive: onDeleted,
  })

  const leading: BookActionEntry[] = []
  if (showOpenFullPage) {
    leading.push({
      key: "openFullPage",
      label: t.plain("openFullPage"),
      icon: <icon.ArrowUpRight className="size-4" />,
      onSelect: () => {
        router.push(fullPageHref ?? `/v3/books/${book.uuid}`)
      },
    })
  }
  if (onEdit && canEdit) {
    leading.push({
      key: "edit",
      label: c.plain("actions.edit"),
      icon: <icon.Edit className="size-4" />,
      onSelect: onEdit,
    })
  }

  return (
    <>
      <FilterableMenu open={open} onOpenChange={onOpenChange}>
        <FilterableMenuTrigger
          render={
            <TooltipButton
              variant="real-ghost"
              size="icon-sm"
              className={className}
              tooltip="Open actions"
              aria-label="Open book actions menu"
              shortcut={["M"]}
            >
              <icon.DotsVertical className="size-3.5 stroke-[1.5]" />
              <span className="sr-only">Open book actions menu</span>
            </TooltipButton>
          }
        />
        <FilterableMenuContent
          align="end"
          searchPlaceholder={t.plain("search")}
        >
          <ActionEntryList entries={[...leading, ...entries]} />
        </FilterableMenuContent>
      </FilterableMenu>

      {dialogs}
    </>
  )
}
