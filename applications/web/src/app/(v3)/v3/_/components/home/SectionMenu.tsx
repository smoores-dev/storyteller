"use client"

import { useState } from "react"

import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"
import { Button } from "@v3/_/components/ui/button"
import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  type HomeSectionWithDetails,
  type ShelfWithBooks,
} from "@/database/shelves"
import * as icon from "@/icons"
import {
  useDeleteUserShelfMutation,
  useListUserShelvesQuery,
  useUpdateHomeSectionMutation,
} from "@/store/api"

export function SectionMenu({
  section,
  className,
}: {
  section: HomeSectionWithDetails
  className?: string | undefined
}) {
  const t = useTranslation("HomePage")
  const tEntity = useTranslation("EntityActions")
  const c = useCommon()

  const isCustom = section.kind === "custom" && section.shelfUuid !== null

  const [updateHomeSection] = useUpdateHomeSectionMutation()
  const [deleteUserShelf] = useDeleteUserShelfMutation()
  const { data: userShelves = [] } = useListUserShelvesQuery(undefined, {
    skip: !isCustom,
  })

  const [editorOpen, setEditorOpen] = useState(false)

  const editingShelf: ShelfWithBooks | null = isCustom
    ? userShelves.find((s) => s.uuid === section.shelfUuid) ?? null
    : null

  const deleteAction = useConfirmAction({
    onConfirm: async () => {
      if (!section.shelfUuid) return
      await deleteUserShelf({ uuid: section.shelfUuid }).unwrap()
    },
    title: tEntity("deleteTitle", {
      count: 1,
      entity: tEntity("entityTypes.shelf", { count: 1 }),
    }),
    description: tEntity("deleteDescription"),
    confirmLabel: c("actions.delete"),
    variant: "destructive",
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(className)}
              aria-label={t("sections.sectionMenu")}
            >
              <icon.DotsVertical className="size-4" />
            </Button>
          }
        />

        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem
            onClick={() => {
              void updateHomeSection({ uuid: section.uuid, enabled: false })
            }}
          >
            <icon.EyeOff className="mr-2 size-4" />
            {t("sections.hideSection")}
          </DropdownMenuItem>

          {isCustom && editingShelf && (
            <DropdownMenuItem
              onClick={() => {
                setEditorOpen(true)
              }}
            >
              <icon.Edit className="mr-2 size-4" />
              {t("sections.editShelf")}
            </DropdownMenuItem>
          )}

          {isCustom && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(event) => {
                  deleteAction.confirm(event)
                }}
                className="text-destructive focus:text-destructive"
              >
                <icon.Trash className="mr-2 size-4" />
                {t("sections.deleteShelf")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isCustom && editingShelf && (
        <ShelfEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          shelf={editingShelf}
        />
      )}

      <ConfirmDialog {...deleteAction.dialogProps} />
    </>
  )
}
