"use client"

import { Reorder, motion, useDragControls } from "motion/react"
import { type ReactElement, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { Button } from "@v3/_/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@v3/_/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@v3/_/components/ui/dialog"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  ConfirmDialog,
  useConfirmAction,
} from "@/app/(v3)/v3/_/components/ui/confirm-dialog"
import { type HomeSectionKind, type ShelfWithBooks } from "@/database/shelves"
import * as icon from "@/icons"
import {
  useDeleteUserShelfMutation,
  useListHomeSectionsQuery,
  useListUserShelvesQuery,
  useSetHomeSectionsMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { ShelfEditor } from "./ShelfEditor"

type ShelfManagerProps = {
  className?: string
  trigger?: ReactElement
}

export function ShelfManager({ className, trigger }: ShelfManagerProps) {
  const t = useTranslation("HomePage")
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="default" size="sm" className={className}>
              <icon.Settings className="mr-2 size-4" />
              {t("sections.customize")}
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sections.title")}</DialogTitle>
          <DialogDescription>{t("sections.description")}</DialogDescription>
        </DialogHeader>
        <ShelfManagerContent
          onClose={() => {
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

type ShelfManagerContentProps = {
  onClose: () => void
}

type LocalHomeSection = {
  uuid: UUID
  shelfUuid: UUID | null
  kind: HomeSectionKind
  name: string | null
  enabled: boolean
  isNew?: boolean
}

const BUILT_IN_KINDS: HomeSectionKind[] = [
  "hero",
  "stats",
  "currentlyReading",
  "nextUpInSeries",
  "recentlyAdded",
  "getStarted",
  "addSection",
]

function ShelfManagerContent({ onClose }: ShelfManagerContentProps) {
  const t = useTranslation("HomePage")
  const c = useCommon()
  const { data: homeSections, isLoading } = useListHomeSectionsQuery()
  const { data: userShelves = [], refetch: refetchUserShelves } =
    useListUserShelvesQuery()
  const [setHomeSections, { isLoading: isSaving }] =
    useSetHomeSectionsMutation()
  const [deleteUserShelf] = useDeleteUserShelfMutation()

  const [localShelves, setLocalShelves] = useState<LocalHomeSection[] | null>(
    null,
  )
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [shelfEditorOpen, setShelfEditorOpen] = useState(false)
  const [editingShelf, setEditingShelf] = useState<ShelfWithBooks | null>(null)

  const shelves: LocalHomeSection[] =
    localShelves ??
    (homeSections ?? []).map((hs) => ({
      uuid: hs.uuid,
      shelfUuid: hs.shelfUuid,
      kind: hs.kind,
      name: hs.name ?? t(`kinds.${hs.kind}.name`),
      enabled: hs.enabled,
    }))

  const shownShelves = shelves.filter((s) => s.enabled)
  const disabledShelves = shelves.filter((s) => !s.enabled)

  const presentBuiltInTypes = shelves
    .filter((s) => s.kind !== "custom")
    .map((s) => s.kind)

  const presentCustomShelfUuids = shelves
    .filter(
      (s): s is LocalHomeSection & { shelfUuid: string; kind: "custom" } =>
        s.kind === "custom" && !!s.shelfUuid,
    )
    .map((s) => s.shelfUuid)

  const hiddenBuiltInTypes = BUILT_IN_KINDS.filter(
    (t) => !presentBuiltInTypes.includes(t),
  )

  const hiddenCustomShelves = userShelves.filter(
    (s: ShelfWithBooks) => !presentCustomShelfUuids.includes(s.uuid),
  )

  const hasHiddenShelves =
    disabledShelves.length > 0 ||
    hiddenBuiltInTypes.length > 0 ||
    hiddenCustomShelves.length > 0

  const commitShown = (nextShown: LocalHomeSection[]) => {
    setLocalShelves([...nextShown, ...disabledShelves])
  }

  const moveShelf = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1

    if (newIndex < 0 || newIndex >= shownShelves.length) return

    const newShown = [...shownShelves]
    const [moved] = newShown.splice(index, 1)
    if (!moved) return

    newShown.splice(newIndex, 0, moved)
    commitShown(newShown)
  }

  const setEnabled = (uuid: string, enabled: boolean) => {
    setLocalShelves(
      shelves.map((s) => (s.uuid === uuid ? { ...s, enabled } : s)),
    )
  }

  const hideShelf = (uuid: string) => {
    if (shownShelves.length <= 1) return
    setEnabled(uuid, false)
  }

  const showBuiltInShelf = (kind: HomeSectionKind) => {
    setLocalShelves([
      ...shelves,
      {
        uuid: uuidv4() as UUID,
        shelfUuid: null,
        kind,
        name: t(`kinds.${kind}.name`),
        enabled: true,
      },
    ])
  }

  const showCustomShelf = (userShelf: ShelfWithBooks) => {
    setLocalShelves([
      ...shelves,
      {
        uuid: uuidv4() as UUID,
        shelfUuid: userShelf.uuid,
        kind: "custom",
        name: userShelf.name,
        enabled: true,
      },
    ])
  }

  const handleDeleteCustomShelf = async (shelfUuid: string) => {
    await deleteUserShelf({ uuid: shelfUuid })
    void refetchUserShelves()
  }

  const handleSave = async () => {
    const shelvesToSave = shelves.map((shelf) => ({
      shelfUuid: shelf.shelfUuid,
      kind: shelf.kind,
      enabled: shelf.enabled,
    }))

    await setHomeSections(shelvesToSave).unwrap()
    setLocalShelves(null)
    onClose()
  }

  const handleCreateNewShelf = () => {
    setEditingShelf(null)
    setShelfEditorOpen(true)
  }

  const handleEditShelf = (shelfUuid: UUID) => {
    const shelf = userShelves.find((s: ShelfWithBooks) => s.uuid === shelfUuid)

    if (shelf) {
      setEditingShelf(shelf)
      setShelfEditorOpen(true)
    }
  }

  const handleShelfSaved = (saved: ShelfWithBooks) => {
    void refetchUserShelves()

    if (!editingShelf) {
      setLocalShelves([
        ...shelves,
        {
          uuid: uuidv4() as UUID,
          shelfUuid: saved.uuid,
          kind: "custom",
          name: saved.name,
          enabled: true,
        },
      ])
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <icon.Loader className="size-6 animate-spin" />
      </div>
    )
  }

  return (
    <>
      <Reorder.Group
        values={shownShelves}
        onReorder={commitShown}
        className={cn("flex flex-col gap-2")}
      >
        {shownShelves.map((shelf, index) => (
          <ShelfItem
            key={shelf.uuid}
            shelf={shelf}
            index={index}
            total={shownShelves.length}
            onMove={(dir) => {
              moveShelf(index, dir)
            }}
            onHide={() => {
              hideShelf(shelf.uuid)
            }}
            canHide={shownShelves.length > 1}
            {...(shelf.shelfUuid
              ? {
                  onEdit: () => {
                    handleEditShelf(shelf.shelfUuid as UUID)
                  },
                }
              : {})}
          />
        ))}
      </Reorder.Group>

      <Button
        variant="outline"
        onClick={handleCreateNewShelf}
        className="mt-2 w-full"
      >
        <icon.Add className="mr-2 size-4" />
        {t("sections.createNewShelf")}
      </Button>

      {hasHiddenShelves && (
        <Collapsible
          open={hiddenOpen}
          onOpenChange={setHiddenOpen}
          className="mt-4"
        >
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 text-sm"
              >
                <icon.ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    hiddenOpen && "rotate-90",
                  )}
                />
                {t("sections.hidden", {
                  count:
                    disabledShelves.length +
                    hiddenBuiltInTypes.length +
                    hiddenCustomShelves.length,
                })}
              </button>
            }
          />

          <CollapsibleContent className="mt-2">
            <div className="flex flex-col gap-2">
              {disabledShelves.map((shelf) => (
                <HiddenShelfItem
                  key={shelf.uuid}
                  name={shelf.name ?? t(`kinds.${shelf.kind}.name`)}
                  description={
                    shelf.kind === "custom"
                      ? t("sections.customShelf")
                      : t(`kinds.${shelf.kind}.description`)
                  }
                  onShow={() => {
                    setEnabled(shelf.uuid, true)
                  }}
                  {...(shelf.kind === "custom" && shelf.shelfUuid
                    ? {
                        onDelete: () =>
                          handleDeleteCustomShelf(shelf.shelfUuid as UUID),
                      }
                    : {})}
                />
              ))}

              {hiddenBuiltInTypes.map((kind) => (
                <HiddenShelfItem
                  key={kind}
                  name={t(`kinds.${kind}.name`)}
                  description={t(`kinds.${kind}.description`)}
                  onShow={() => {
                    showBuiltInShelf(kind)
                  }}
                />
              ))}

              {hiddenCustomShelves.map((userShelf: ShelfWithBooks) => (
                <HiddenShelfItem
                  key={userShelf.uuid}
                  name={userShelf.name}
                  description={t("sections.customShelf")}
                  onShow={() => {
                    showCustomShelf(userShelf)
                  }}
                  onDelete={() => handleDeleteCustomShelf(userShelf.uuid)}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <ShelfEditor
        open={shelfEditorOpen}
        onOpenChange={setShelfEditorOpen}
        shelf={editingShelf}
        onSaved={handleShelfSaved}
      />

      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          {c("actions.cancel")}
        </Button>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <icon.Loader className="mr-2 size-4 animate-spin" />}
          {t("sections.save")}
        </Button>
      </DialogFooter>
    </>
  )
}

type ShelfItemProps = {
  shelf: LocalHomeSection
  index: number
  total: number
  onMove: (direction: "up" | "down") => void
  onHide: () => void
  onEdit?: () => void
  canHide: boolean
}

function ShelfItem({
  shelf,
  index,
  total,
  onMove,
  onHide,
  onEdit,
  canHide,
}: ShelfItemProps) {
  const t = useTranslation("HomePage")
  const isBuiltIn = shelf.kind !== "custom"
  const displayName = shelf.name ?? t(`kinds.${shelf.kind}.name`)
  const controls = useDragControls()
  const [isDragging, setIsDragging] = useState(false)

  return (
    <Reorder.Item
      value={shelf}
      className={cn(
        "bg-muted flex items-center gap-2 rounded-lg border p-1.5",
        isDragging && "cursor-grabbing!",
      )}
      dragControls={controls}
      dragListener={false}
    >
      <motion.button
        className={cn(
          "size-8 hover:cursor-grab",
          isDragging && "cursor-grabbing!",
        )}
        onPointerDown={(e) => {
          e.preventDefault()
          setIsDragging(true)
          controls.start(e)
        }}
        onPointerUp={() => {
          setIsDragging(false)
        }}
      >
        <icon.GripVertical className="text-muted-foreground size-4 shrink-0" />
      </motion.button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-sm font-medium">{displayName}</div>

        {isBuiltIn && (
          <div className="text-muted-foreground text-xs">
            {t(`kinds.${shelf.kind}.description`)}
          </div>
        )}

        {!isBuiltIn && (
          <div className="text-muted-foreground text-xs">
            {t("sections.customShelf")}
          </div>
        )}
      </div>

      {onEdit && (
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <icon.Edit className="size-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onHide}
        disabled={!canHide}
        className={cn(!canHide && "invisible")}
        title={t("sections.hideFromHome")}
      >
        <icon.EyeOff className="size-4" />
      </Button>

      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            onMove("up")
          }}
          disabled={index === 0}
        >
          <icon.ChevronUp className="size-3" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            onMove("down")
          }}
          disabled={index === total - 1}
        >
          <icon.ChevronDown className="size-3" />
        </Button>
      </div>
    </Reorder.Item>
  )
}

type HiddenShelfItemProps = {
  name: string
  description: string
  onShow: () => void
  onDelete?: () => void
}

function HiddenShelfItem({
  name,
  description,
  onShow,
  onDelete,
}: HiddenShelfItemProps) {
  const t = useTranslation("HomePage")
  const c = useCommon()

  const deleteAction = useConfirmAction({
    onConfirm: onDelete ?? (() => {}),
    title: t("sections.deletePermanently"),
    description: t("sections.deletePermanentlyDescription"),
    confirmLabel: c("actions.delete"),
    variant: "destructive",
  })

  return (
    <div className="bg-muted/50 flex items-center gap-2 rounded-lg border p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-muted-foreground text-xs">{description}</div>
      </div>

      <Button variant="outline" size="sm" onClick={onShow} className="h-7">
        <icon.Add className="mr-1 size-3" />
        {t("sections.show")}
      </Button>

      {onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={deleteAction.confirm}
          className="text-destructive hover:text-destructive"
          title={t("sections.deletePermanently")}
        >
          <icon.Trash className="size-4" />
        </Button>
      )}
      <ConfirmDialog {...deleteAction.dialogProps} />
    </div>
  )
}
