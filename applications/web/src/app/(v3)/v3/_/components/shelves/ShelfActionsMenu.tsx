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

import { type ShelfWithBooks } from "@/database/shelves"
import * as icon from "@/icons"
import { useDeleteUserShelfMutation } from "@/store/api"

import { V3Link } from "../v3-link"

export function ShelfActionsMenu({
  shelf,
  allEntitiesPageHref,
  onDeleted,
}: {
  shelf: ShelfWithBooks | undefined
  allEntitiesPageHref?:
    | {
        label: string
        href: string
      }
    | undefined
  onDeleted?: (() => void) | undefined
}) {
  const tEntity = useTranslation("EntityActions")
  const c = useCommon()

  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteShelf] = useDeleteUserShelfMutation()

  const deleteAction = useConfirmAction({
    onConfirm: async () => {
      if (!shelf) return
      await deleteShelf({ uuid: shelf.uuid }).unwrap()
      onDeleted?.()
    },
    title: tEntity("deleteTitle", {
      count: 1,
      entity: tEntity("entityTypes.shelf", { count: 1 }),
    }),
    description: tEntity("deleteDescription"),
    confirmLabel: c("actions.delete"),
    variant: "destructive",
  })

  if (!shelf) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <icon.DotsVertical className="h-4 w-4" />
            </Button>
          }
        />

        <DropdownMenuContent align="end" className="min-w-40">
          {allEntitiesPageHref && (
            <DropdownMenuItem
              render={
                <V3Link href={allEntitiesPageHref.href}>
                  <icon.ArrowRight className="mr-2 h-4 w-4" />
                  {allEntitiesPageHref.label}
                </V3Link>
              }
            />
          )}
          <DropdownMenuItem
            onClick={() => {
              setEditorOpen(true)
            }}
          >
            <icon.Edit className="mr-2 h-4 w-4" />
            {c("actions.edit")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(event) => {
              deleteAction.confirm(event)
            }}
            className="text-destructive focus:text-destructive"
          >
            <icon.Trash className="mr-2 h-4 w-4" />
            {c("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShelfEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        shelf={shelf}
      />

      <ConfirmDialog {...deleteAction.dialogProps} />
    </>
  )
}
