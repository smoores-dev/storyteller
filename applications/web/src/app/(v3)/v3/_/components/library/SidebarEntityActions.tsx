"use client"

import { type MouseEvent, useCallback, useMemo, useState } from "react"

import {
  type FacetValue,
  type LibraryEntityType,
} from "@v3/_/components/library/library-sections"
import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"
import { ActionTray } from "@v3/_/components/ui/action-tray"
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"
import { type ShelfFilterNode } from "@/shelves"
import {
  useDeleteCollectionMutation,
  useDeleteCreatorMutation,
  useDeleteIdentifierTypeMutation,
  useDeleteSeriesMutation,
  useDeleteTagMutation,
  useMergeCollectionsMutation,
  useMergeCreatorsMutation,
  useMergeIdentifierTypesMutation,
  useMergeSeriesMutation,
  useMergeTagsMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

type SidebarEntityActionsProps = {
  entityType: LibraryEntityType
  selectedItems: Set<string>
  allItems: FacetValue[]
  onStopSelecting: () => void
  onEdit?: (item: FacetValue) => void
  toShelfFilter?: ((itemKey: string) => ShelfFilterNode) | undefined
  isItemLocked?: ((item: FacetValue) => boolean) | undefined
}

function useEntityMutations(entityType: LibraryEntityType) {
  const [deleteTag] = useDeleteTagMutation()
  const [deleteCreator] = useDeleteCreatorMutation()
  const [deleteSeries] = useDeleteSeriesMutation()
  const [deleteCollection] = useDeleteCollectionMutation()
  const [deleteIdentifierType] = useDeleteIdentifierTypeMutation()

  const [mergeTags] = useMergeTagsMutation()
  const [mergeCreators] = useMergeCreatorsMutation()
  const [mergeSeriesM] = useMergeSeriesMutation()
  const [mergeCollections] = useMergeCollectionsMutation()
  const [mergeIdentifierTypes] = useMergeIdentifierTypesMutation()

  const deleteEntity = useCallback(
    async (uuid: UUID) => {
      switch (entityType) {
        case "tag":
          return deleteTag({ uuid }).unwrap()
        case "creator":
          return deleteCreator({ uuid }).unwrap()
        case "series":
          return deleteSeries({ uuid }).unwrap()
        case "collection":
          return deleteCollection({ uuid }).unwrap()
        case "identifier":
          return deleteIdentifierType({ uuid }).unwrap()
      }
    },
    [
      entityType,
      deleteTag,
      deleteCreator,
      deleteSeries,
      deleteCollection,
      deleteIdentifierType,
    ],
  )

  const mergeEntities = useCallback(
    async (targetUuid: UUID, sourceUuids: UUID[]) => {
      switch (entityType) {
        case "tag":
          return mergeTags({ targetUuid, sourceUuids }).unwrap()
        case "creator":
          return mergeCreators({ targetUuid, sourceUuids }).unwrap()
        case "series":
          return mergeSeriesM({ targetUuid, sourceUuids }).unwrap()
        case "collection":
          return mergeCollections({ targetUuid, sourceUuids }).unwrap()
        case "identifier":
          return mergeIdentifierTypes({ targetUuid, sourceUuids }).unwrap()
      }
    },
    [
      entityType,
      mergeTags,
      mergeCreators,
      mergeSeriesM,
      mergeCollections,
      mergeIdentifierTypes,
    ],
  )

  return { deleteEntity, mergeEntities }
}

export function SidebarEntityActions({
  entityType,
  selectedItems,
  allItems,
  onStopSelecting,
  onEdit,
  toShelfFilter,
  isItemLocked,
}: SidebarEntityActionsProps) {
  const t = useTranslation("EntityActions")
  const c = useCommon()
  const { deleteEntity, mergeEntities } = useEntityMutations(entityType)
  const [isDeleting, setIsDeleting] = useState(false)
  const [shelfEditorOpen, setShelfEditorOpen] = useState(false)

  const selectedArray = Array.from(selectedItems)
  const selectedItemObjects = allItems.filter((item) =>
    selectedItems.has(item.key),
  )

  const count = selectedItems.size
  const singleSelected = count === 1 ? selectedItemObjects[0] : undefined

  const lockedSelected = isItemLocked
    ? selectedItemObjects.filter((item) => isItemLocked(item))
    : []
  const canDeleteSelection = lockedSelected.length === 0
  const mergeTargets =
    lockedSelected.length === 0
      ? selectedItemObjects
      : lockedSelected.length === 1
        ? lockedSelected
        : []

  // merge state
  const [mergeTarget, setMergeTarget] = useState<FacetValue | null>(null)
  const [isMerging, setIsMerging] = useState(false)

  const combinedShelfFilter = useMemo<ShelfFilterNode | null>(() => {
    if (!toShelfFilter || selectedItemObjects.length === 0) return null

    const children = selectedItemObjects.map((item) => toShelfFilter(item.key))

    if (children.length === 1) return children[0] ?? null
    return { type: "or" as const, children }
  }, [toShelfFilter, selectedItemObjects])

  const suggestedShelfName = useMemo(
    () => selectedItemObjects.map((item) => item.name).join(", "),
    [selectedItemObjects],
  )

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)

    try {
      await Promise.all(selectedArray.map((uuid) => deleteEntity(uuid as UUID)))

      onStopSelecting()
    } finally {
      setIsDeleting(false)
    }
  }, [selectedArray, deleteEntity, onStopSelecting])

  const handleMerge = useCallback(async () => {
    if (!mergeTarget) return

    setIsMerging(true)

    try {
      const sourceUuids = selectedArray.filter(
        (uuid) => uuid !== mergeTarget.key,
      ) as UUID[]

      await mergeEntities(mergeTarget.key as UUID, sourceUuids)
      onStopSelecting()
    } finally {
      setIsMerging(false)
      setMergeTarget(null)
    }
  }, [mergeTarget, selectedArray, mergeEntities, onStopSelecting])

  const entityLabel = t(`entityTypes.${entityType}` as "entityTypes.tag", {
    count,
  })

  const deleteAction = useConfirmAction({
    onConfirm: handleDelete,
    title: t.plain("deleteTitle", { count, entity: entityLabel }),
    description: t("deleteDescription"),
    confirmLabel: c("actions.delete"),
    variant: "destructive",
  })

  const mergeAction = useConfirmAction({
    onConfirm: handleMerge,
    title: mergeTarget
      ? t.plain("mergeTitle", { count, target: mergeTarget.name })
      : c("actions.merge"),
    description: t("mergeDescription"),
    confirmLabel: c("actions.merge"),
    variant: "default",
  })

  const handleMergeInto = useCallback(
    (target: FacetValue, event: MouseEvent) => {
      setMergeTarget(target)
      mergeAction.confirm(event)
    },
    [mergeAction],
  )

  return (
    <>
      <ActionTray
        show={count > 0}
        className="absolute bottom-12 gap-1 border-x-0 border-b-0 p-1 pl-2.5"
      >
        <span className="flex-1 text-sm whitespace-nowrap">
          {c.rich("selectedCount", {
            count,
            em: (chunks) => <em>{chunks}</em>,
          })}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs">
                <icon.DotsVertical className="size-3.5" />
              </Button>
            }
          />

          <DropdownMenuContent align="end" className="w-fit">
            {onEdit && singleSelected && !isItemLocked?.(singleSelected) && (
              <DropdownMenuItem
                onClick={() => {
                  onEdit(singleSelected)
                }}
              >
                <icon.Edit className="mr-2 h-4 w-4" />
                {c("actions.edit")}
              </DropdownMenuItem>
            )}

            {count >= 2 && mergeTargets.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <icon.GitMerge className="mr-2 h-4 w-4" />
                  {t("mergeInto")}
                </DropdownMenuSubTrigger>

                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                  {mergeTargets.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      onClick={(event) => {
                        handleMergeInto(item, event)
                      }}
                    >
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {toShelfFilter && combinedShelfFilter && (
              <DropdownMenuItem
                onClick={() => {
                  setShelfEditorOpen(true)
                }}
              >
                <icon.BookmarkPlus className="mr-2 h-4 w-4" />
                {t("createShelfWith")}
              </DropdownMenuItem>
            )}

            {((onEdit && singleSelected) || count >= 2 || toShelfFilter) &&
            canDeleteSelection ? (
              <DropdownMenuSeparator />
            ) : null}

            {canDeleteSelection && (
              <DropdownMenuItem
                onClick={(event) => {
                  deleteAction.confirm(event)
                }}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <icon.Trash className="mr-2 h-4 w-4" />
                {isDeleting ? c("states.deleting") : c("actions.delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon-xs" onClick={onStopSelecting}>
          <icon.Close className="size-3.5" />
        </Button>
      </ActionTray>

      <ConfirmDialog {...deleteAction.dialogProps} />
      <ConfirmDialog {...mergeAction.dialogProps} isLoading={isMerging} />

      {toShelfFilter && (
        <ShelfEditor
          open={shelfEditorOpen}
          onOpenChange={setShelfEditorOpen}
          initialFilter={combinedShelfFilter}
          initialName={suggestedShelfName}
        />
      )}
    </>
  )
}
