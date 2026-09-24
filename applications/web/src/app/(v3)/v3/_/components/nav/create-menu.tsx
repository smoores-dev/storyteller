"use client"

import { useState } from "react"

import { useAddBook } from "@v3/_/components/AddBookButton"
import { CreateCollectionDialog } from "@v3/_/components/books/CreateCollectionDialog"
import { EntityCreateDialog } from "@v3/_/components/library/EntityCreateDialog"
import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuSeparator,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { SidebarMenuButton } from "@v3/_/components/ui/sidebar"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"

import { COLLECTION_ICON, SHELF_ICON } from "./sidebar-items"

type CreateTarget = "collection" | "shelf" | "tag" | "series"

export function CreateMenu() {
  const t = useTranslation("AppSidebar")
  const tEntity = useTranslation("EntityActions")
  const permissions = usePermissions()

  const addBook = useAddBook()
  const [creating, setCreating] = useState<CreateTarget | null>(null)

  const closeDialog = (open: boolean) => {
    if (!open) setCreating(null)
  }

  const canAddBooks = !!permissions?.bookCreate
  const canCreateCollections = !!permissions?.collectionCreate
  const canEditBooks = !!permissions?.bookUpdate

  return (
    <>
      <FilterableMenu>
        <FilterableMenuTrigger
          render={
            <TooltipButton
              variant="ghost"
              size="icon-lg"
              tooltip={t("create")}
              aria-label={t.plain("create")}
              render={
                <SidebarMenuButton>
                  <icon.Plus />
                </SidebarMenuButton>
              }
            />
          }
        />
        <FilterableMenuContent searchable={false} side="top">
          {canAddBooks && (
            <>
              {addBook.menuItems}
              <FilterableMenuSeparator />
            </>
          )}

          {canCreateCollections && (
            <FilterableMenuItem
              icon={<COLLECTION_ICON className="size-4" />}
              onSelect={() => {
                setCreating("collection")
              }}
            >
              {tEntity.plain("createCollection")}
            </FilterableMenuItem>
          )}

          <FilterableMenuItem
            icon={<SHELF_ICON className="size-4" />}
            onSelect={() => {
              setCreating("shelf")
            }}
          >
            {tEntity.plain("createShelf")}
          </FilterableMenuItem>

          {canEditBooks && (
            <>
              <FilterableMenuItem
                icon={<icon.Tag className="size-4" />}
                onSelect={() => {
                  setCreating("tag")
                }}
              >
                {tEntity.plain("createTag")}
              </FilterableMenuItem>

              <FilterableMenuItem
                icon={<icon.List className="size-4" />}
                onSelect={() => {
                  setCreating("series")
                }}
              >
                {tEntity.plain("createSeries")}
              </FilterableMenuItem>
            </>
          )}
        </FilterableMenuContent>
      </FilterableMenu>

      {canAddBooks && addBook.dialogs}

      <CreateCollectionDialog
        open={creating === "collection"}
        onOpenChange={closeDialog}
      />

      <ShelfEditor
        open={creating === "shelf"}
        onOpenChange={closeDialog}
        shelf={null}
      />

      <EntityCreateDialog
        entityType="tag"
        open={creating === "tag"}
        onOpenChange={closeDialog}
      />

      <EntityCreateDialog
        entityType="series"
        open={creating === "series"}
        onOpenChange={closeDialog}
      />
    </>
  )
}
