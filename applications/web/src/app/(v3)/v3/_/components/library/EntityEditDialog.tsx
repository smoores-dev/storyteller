"use client"

import { EditCreatorDialog } from "@v3/_/components/library/EditCreatorDialog"
import { EditIdentifierTypeDialog } from "@v3/_/components/library/EditIdentifierTypeDialog"
import { EditStatusDialog } from "@v3/_/components/library/EditStatusDialog"
import { EditTagDialog } from "@v3/_/components/library/EditTagDialog"
import {
  type FacetValue,
  type LibraryEntityType,
} from "@v3/_/components/library/library-sections"
import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"

import { CreateCollectionDialog } from "@/app/(v3)/v3/_/components/books/CreateCollectionDialog"
import { EditSeriesDialog } from "@/app/(v3)/v3/_/components/books/EditSeriesDialog"
import { type ShelfWithBooks } from "@/database/shelves"
import { useListUserShelvesQuery } from "@/store/api"
import { type UUID } from "@/uuid"

export function EntityEditDialog({
  entityType,
  open,
  onOpenChange,
  item,
}: {
  entityType: LibraryEntityType
  open: boolean
  onOpenChange: (open: boolean) => void
  item: FacetValue | null
}) {
  if (entityType === "tag") {
    return (
      <EditTagDialog
        open={open}
        onOpenChange={onOpenChange}
        tag={item ? { uuid: item.key, name: item.name } : null}
      />
    )
  }

  if (entityType === "creator") {
    return (
      <EditCreatorDialog
        open={open}
        onOpenChange={onOpenChange}
        creator={
          item ? { uuid: item.key, name: item.name, fileAs: null } : null
        }
      />
    )
  }

  if (entityType === "series") {
    return (
      <EditSeriesDialog
        open={open}
        onOpenChange={onOpenChange}
        series={
          item
            ? { uuid: item.key as UUID, name: item.name, description: null }
            : null
        }
      />
    )
  }

  if (entityType === "status") {
    return (
      <EditStatusDialog
        open={open}
        onOpenChange={onOpenChange}
        status={item ? { uuid: item.key, name: item.name } : null}
      />
    )
  }

  if (entityType === "identifier") {
    return (
      <EditIdentifierTypeDialog
        open={open}
        onOpenChange={onOpenChange}
        identifierType={item ? { uuid: item.key, name: item.name } : null}
      />
    )
  }

  if (entityType === "shelf") {
    return (
      <EditShelfDialog
        open={open}
        onOpenChange={onOpenChange}
        shelfUuid={item ? (item.key as UUID) : null}
      />
    )
  }

  // the only remaining entity type is "collection"
  return (
    <CreateCollectionDialog
      open={open}
      onOpenChange={onOpenChange}
      collectionUuid={item ? item.key : null}
    />
  )
}

// the shelves facet only carries uuid + name, but ShelfEditor edits the whole
// shelf, so resolve the full row from the list query before mounting it.
function EditShelfDialog({
  open,
  onOpenChange,
  shelfUuid,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shelfUuid: UUID | null
}) {
  const { data: shelves = [] } = useListUserShelvesQuery(undefined, {
    skip: !open,
  })

  const shelf = (shelves as unknown as ShelfWithBooks[]).find(
    (s) => s.uuid === shelfUuid,
  )

  if (!shelf) return null

  return <ShelfEditor open={open} onOpenChange={onOpenChange} shelf={shelf} />
}
