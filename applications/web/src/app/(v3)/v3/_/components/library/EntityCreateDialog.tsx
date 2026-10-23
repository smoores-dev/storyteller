"use client"

import { type LibraryEntityType } from "@v3/_/components/library/library-sections"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { CreateCollectionDialog } from "@/app/(v3)/v3/_/components/books/CreateCollectionDialog"
import { CreateSeriesDialog } from "@/app/(v3)/v3/_/components/books/CreateSeriesDialog"
import { CreateTagDialog } from "@/app/(v3)/v3/_/components/books/CreateTagDialog"
import { CreateStatusDialog } from "@/app/(v3)/v3/_/components/library/CreateStatusDialog"
import { usePermissions } from "@/hooks/usePermissions"

export function useCreateEntity(entityType?: LibraryEntityType) {
  const permissions = usePermissions()
  const tEntity = useTranslation("EntityActions")

  const canCreate =
    (entityType === "collection" && !!permissions?.collectionCreate) ||
    // Disabling series creation for now: empty series are never returned
    // anywhere books can be added to a series, so a series created this
    // way always stays empty
    // ((entityType === "tag" || entityType === "series") &&
    (entityType === "tag" && !!permissions?.bookUpdate) ||
    (entityType === "status" && !!permissions?.settingsUpdate)

  const createLabel =
    entityType === "collection"
      ? tEntity("createCollection")
      : entityType === "tag"
        ? tEntity("createTag")
        : entityType === "series"
          ? tEntity("createSeries")
          : entityType === "status"
            ? tEntity("createStatus")
            : undefined

  return { canCreate, createLabel }
}

export function EntityCreateDialog({
  entityType,
  open,
  onOpenChange,
}: {
  entityType: LibraryEntityType
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (entityType === "collection") {
    return <CreateCollectionDialog open={open} onOpenChange={onOpenChange} />
  }

  if (entityType === "tag") {
    return <CreateTagDialog open={open} onOpenChange={onOpenChange} />
  }

  if (entityType === "status") {
    return <CreateStatusDialog open={open} onOpenChange={onOpenChange} />
  }

  return <CreateSeriesDialog open={open} onOpenChange={onOpenChange} />
}
