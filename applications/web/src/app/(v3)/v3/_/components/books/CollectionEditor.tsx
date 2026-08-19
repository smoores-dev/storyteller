import { useState } from "react"

import { useTranslation } from "@v3/_/hooks/use-translation"

import { useListCollectionsQuery } from "@/store/api"

import { useBookForm } from "./BookDetails/BookFormProvider"
import { CreateCollectionDialog } from "./CreateCollectionDialog"
import { RelationFormField } from "./RelationFormField"

export function CollectionEditor({ className }: { className?: string }) {
  const { form } = useBookForm()
  const tActions = useTranslation("BookActions")

  const { data: allCollections = [] } = useListCollectionsQuery()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createName, setCreateName] = useState("")

  return (
    <RelationFormField
      name="collections"
      source="collections"
      entryId={(collection) => collection.uuid}
      itemId={(item) => item.uuid}
      toChip={(collection) => {
        const full = allCollections.find((c) => c.uuid === collection.uuid)
        return {
          uuid: collection.uuid,
          name: collection.name,
          icon: full?.icon ?? null,
          color: full?.color ?? null,
        }
      }}
      entryFromPick={(item) => ({ uuid: item.uuid, name: item.name })}
      badgeVariant="secondary"
      searchPlaceholder={tActions.plain("search")}
      className={className}
      onCreate={(name) => {
        setCreateName(name)
        setShowCreateDialog(true)
      }}
    >
      <CreateCollectionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        initialName={createName}
        onCreated={(uuid) => {
          const current = form.getValues("collections")
          if (!current.some((c) => c.uuid === uuid)) {
            form.setValue(
              "collections",
              [...current, { uuid, name: createName }],
              { shouldDirty: true },
            )
          }
        }}
      />
    </RelationFormField>
  )
}
