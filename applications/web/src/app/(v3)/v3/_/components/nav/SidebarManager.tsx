"use client"

import { CollisionPriority } from "@dnd-kit/abstract"
import { PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom"
import { move } from "@dnd-kit/helpers"
import {
  DragDropProvider,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"
import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { Input } from "@v3/_/components/ui/input"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@v3/_/components/ui/sidebar"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ShelfWithBooks } from "@/database/shelves"
import {
  type SidebarGroupKind,
  type SidebarGroupWithItems,
  type SidebarItemKind,
} from "@/database/sidebar"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import { builtinGroupFor } from "@/sidebar-builtins"
import {
  useListUserShelvesQuery,
  useSetSidebarGroupsMutation,
} from "@/store/api"
import { extractEmojiIcon } from "@/strings"

import { BUILTIN_SIDEBAR_MAP, type BuiltinSidebarItem } from "./sidebar-items"

type ShelfListItem = {
  uuid: string
  name: string
  icon?: string | null
  color?: string | null
}

type LocalItem = {
  id: string
  kind: SidebarItemKind
  builtinKey: string | null
  collectionUuid: string | null
  shelfUuid: string | null
  name: string
  icon: string | null
  color: string | null
}

type LocalGroup = {
  id: string
  name: string
  kind: SidebarGroupKind
  hidden: boolean
  items: LocalItem[]
}

type ManagerState = {
  groups: LocalGroup[]
  hidden: LocalItem[]
}

const HIDDEN_CONTAINER_ID = "__hidden__"

const SECTION_TYPE = "section"
const ITEM_TYPE = "item"

function cleanName(name: string | null | undefined): string {
  return extractEmojiIcon(name ?? "").label || (name ?? "")
}

type SidebarManagerProps = {
  groups: SidebarGroupWithItems[]
  onClose: () => void
}

export function SidebarManager({ groups, onClose }: SidebarManagerProps) {
  const t = useTranslation("SidebarManager")
  const tApp = useTranslation("AppSidebar")
  const tLibrary = useTranslation("LibraryPage")
  const c = useCommon()
  const permissions = usePermissions()

  const [setSidebarGroups, { isLoading: isSaving }] =
    useSetSidebarGroupsMutation()

  const { data: rawShelves = [] } = useListUserShelvesQuery()
  const userShelves = rawShelves as unknown as Array<
    ShelfListItem & ShelfWithBooks
  >

  const [shelfEditorState, setShelfEditorState] = useState<string | null>(null)

  const builtinTitle = (builtin: BuiltinSidebarItem) =>
    builtin.labelNs === "AppSidebar"
      ? tApp(builtin.labelKey)
      : tLibrary(builtin.labelKey)

  const toLocalItem = (
    item: SidebarGroupWithItems["items"][number],
  ): LocalItem => {
    if (item.kind === "builtin" && item.builtinKey) {
      const builtin = BUILTIN_SIDEBAR_MAP[item.builtinKey]
      return {
        id: `builtin:${item.builtinKey}`,
        kind: "builtin",
        builtinKey: item.builtinKey,
        collectionUuid: null,
        shelfUuid: null,
        name: builtin ? builtinTitle(builtin) : item.builtinKey,
        icon: null,
        color: null,
      }
    }

    if (item.kind === "collection") {
      return {
        id: `collection:${item.collectionUuid}`,
        kind: "collection",
        builtinKey: null,
        collectionUuid: item.collectionUuid,
        shelfUuid: null,
        name: cleanName(item.name),
        icon: item.icon ?? null,
        color: item.color ?? null,
      }
    }

    return {
      id: `shelf:${item.shelfUuid}`,
      kind: "shelf",
      builtinKey: null,
      collectionUuid: null,
      shelfUuid: item.shelfUuid,
      name: cleanName(item.name),
      icon: item.icon ?? null,
      color: item.color ?? null,
    }
  }

  const [state, setState] = useState<ManagerState>(() => ({
    groups: groups.map((g) => ({
      id: g.uuid,
      name: g.name,
      kind: g.kind,
      hidden: g.hidden,
      items: g.items.filter((i) => !i.hidden).map(toLocalItem),
    })),
    hidden: groups.flatMap((g) =>
      g.items.filter((i) => i.hidden).map(toLocalItem),
    ),
  }))

  const previousState = useRef(state)

  const canSee = (item: LocalItem) => {
    if (item.kind !== "builtin" || !item.builtinKey) return true
    const builtin = BUILTIN_SIDEBAR_MAP[item.builtinKey]
    return !builtin?.permission || !!permissions?.[builtin.permission]
  }

  const findContainer = (s: ManagerState, id: string): string | null => {
    if (s.hidden.some((i) => i.id === id)) return HIDDEN_CONTAINER_ID
    return s.groups.find((g) => g.items.some((i) => i.id === id))?.id ?? null
  }

  const findItem = (s: ManagerState, id: string): LocalItem | null =>
    s.hidden.find((i) => i.id === id) ??
    s.groups.flatMap((g) => g.items).find((i) => i.id === id) ??
    null

  const handleDragStart = () => {
    previousState.current = state
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (event.operation.source?.type === SECTION_TYPE) return

    setState((prev) => {
      const containers = Object.fromEntries([
        ...prev.groups.map((g) => [g.id, g.items] as const),
        [HIDDEN_CONTAINER_ID, prev.hidden] as const,
      ])
      const moved = move(containers, event)

      return {
        groups: prev.groups.map((g) => ({
          ...g,
          items: moved[g.id] ?? g.items,
        })),
        hidden: moved[HIDDEN_CONTAINER_ID] ?? prev.hidden,
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled) {
      setState(previousState.current)
      return
    }

    if (event.operation.source?.type !== SECTION_TYPE) return

    setState((prev) => {
      const order = move(
        prev.groups.filter((g) => !g.hidden).map((g) => g.id),
        event,
      )
      const byId = new Map(prev.groups.map((g) => [g.id, g]))
      const reordered = order.flatMap((id) => byId.get(id) ?? [])
      let next = 0

      return {
        ...prev,
        groups: prev.groups.map((g) =>
          g.hidden ? g : (reordered[next++] ?? g),
        ),
      }
    })
  }

  const hideItem = (itemId: string) => {
    setState((prev) => {
      const item = findItem(prev, itemId)
      if (!item) return prev
      return {
        groups: prev.groups.map((g) => ({
          ...g,
          items: g.items.filter((i) => i.id !== itemId),
        })),
        hidden: [...prev.hidden, item],
      }
    })
  }

  const setGroupHidden = (groupId: string, hidden: boolean) => {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, hidden } : g)),
    }))
  }

  const defaultGroupFor = (s: ManagerState, item: LocalItem) => {
    const kind: SidebarGroupKind =
      item.kind === "collection"
        ? "collections"
        : item.kind === "shelf"
          ? "shelves"
          : (builtinGroupFor(item.builtinKey ?? "") ?? "library")

    return (
      s.groups.find((g) => g.kind === kind) ?? s.groups[s.groups.length - 1]
    )
  }

  const restoreItem = (itemId: string) => {
    setState((prev) => {
      const item = prev.hidden.find((i) => i.id === itemId)
      if (!item) return prev
      const target = defaultGroupFor(prev, item)
      if (!target) return prev
      return {
        groups: prev.groups.map((g) =>
          g.id === target.id ? { ...g, items: [...g.items, item] } : g,
        ),
        hidden: prev.hidden.filter((i) => i.id !== itemId),
      }
    })
  }

  const renameGroup = (groupId: string, name: string) => {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }))
  }

  const removeGroup = (groupId: string) => {
    setState((prev) => {
      const group = prev.groups.find((g) => g.id === groupId)
      if (!group || group.kind) return prev
      return {
        groups: prev.groups.filter((g) => g.id !== groupId),
        hidden: [...prev.hidden, ...group.items],
      }
    })
  }

  const addGroup = () => {
    setState((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          id: `new:${uuidv4()}`,
          name: t("newSection"),
          kind: null,
          hidden: false,
          items: [],
        },
      ],
    }))
  }

  const handleShelfSaved = (rawSaved: ShelfWithBooks) => {
    const saved = rawSaved as unknown as ShelfListItem

    const itemPayload: LocalItem = {
      id: `shelf:${saved.uuid}`,
      kind: "shelf",
      builtinKey: null,
      collectionUuid: null,
      shelfUuid: saved.uuid,
      name: cleanName(saved.name),
      icon: saved.icon ?? null,
      color: saved.color ?? null,
    }

    setState((prev) => {
      const existsIn = findContainer(prev, itemPayload.id)
      if (existsIn) {
        return {
          groups: prev.groups.map((g) => ({
            ...g,
            items: g.items.map((i) =>
              i.id === itemPayload.id ? itemPayload : i,
            ),
          })),
          hidden: prev.hidden.map((i) =>
            i.id === itemPayload.id ? itemPayload : i,
          ),
        }
      }

      const target = defaultGroupFor(prev, itemPayload)
      if (!target) return prev
      return {
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === target.id ? { ...g, items: [...g.items, itemPayload] } : g,
        ),
      }
    })
  }

  const handleSave = async () => {
    const payload = state.groups.map((g) => ({
      uuid: g.id.startsWith("new:") ? undefined : g.id,
      name: g.name,
      kind: g.kind ?? undefined,
      hidden: g.hidden,
      items: g.items.map((i) => ({
        kind: i.kind,
        builtinKey: i.kind === "builtin" ? i.builtinKey : undefined,
        collectionUuid: i.kind === "collection" ? i.collectionUuid : undefined,
        shelfUuid: i.kind === "shelf" ? i.shelfUuid : undefined,
        hidden: false,
      })),
    }))

    for (const item of state.hidden) {
      const target = defaultGroupFor(state, item)
      const group = payload.find((g) => g.uuid === target?.id) ?? payload[0]
      group?.items.push({
        kind: item.kind,
        builtinKey: item.kind === "builtin" ? item.builtinKey : undefined,
        collectionUuid:
          item.kind === "collection" ? item.collectionUuid : undefined,
        shelfUuid: item.kind === "shelf" ? item.shelfUuid : undefined,
        hidden: true,
      })
    }

    await setSidebarGroups(payload).unwrap()

    onClose()
  }

  const visibleHidden = state.hidden.filter(canSee)
  const visibleGroups = state.groups.filter((g) => !g.hidden)
  const hiddenGroups = state.groups.filter((g) => g.hidden)

  return (
    <>
      <SidebarGroup className="flex-1 overflow-y-auto">
        <SidebarGroupLabel className="flex items-center justify-between">
          <span className="font-sans text-[10px] font-medium tracking-[0.14em] uppercase opacity-60">
            {t("title")}
          </span>

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              disabled={isSaving}
              title={c("actions.cancel")}
            >
              <icon.Close className="size-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleSave}
              disabled={isSaving}
              title={c("actions.done")}
            >
              {isSaving ? (
                <icon.Loader className="size-3.5 animate-spin" />
              ) : (
                <icon.Check className="size-3.5" />
              )}
            </Button>
          </div>
        </SidebarGroupLabel>

        <SidebarGroupContent>
          <DragDropProvider
            sensors={(defaults) => [
              ...defaults.filter((sensor) => sensor !== PointerSensor),
              PointerSensor.configure({
                activationConstraints: [
                  new PointerActivationConstraints.Distance({ value: 5 }),
                ],
              }),
            ]}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex flex-col gap-3 px-1">
              {visibleGroups.map((group, index) => (
                <EditableGroup
                  key={group.id}
                  group={group}
                  index={index}
                  items={group.items.filter(canSee)}
                  onRename={(name) => {
                    renameGroup(group.id, name)
                  }}
                  onRemoveGroup={
                    group.kind
                      ? undefined
                      : () => {
                          removeGroup(group.id)
                        }
                  }
                  onHideGroup={() => {
                    setGroupHidden(group.id, true)
                  }}
                  onHideItem={hideItem}
                  onEditItem={(item) => {
                    if (item.kind === "shelf" && item.shelfUuid) {
                      setShelfEditorState(item.shelfUuid)
                    }
                  }}
                  t={t as unknown as (key: string) => string}
                />
              ))}

              {hiddenGroups.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground px-1 text-[10px] font-medium tracking-[0.14em] uppercase">
                    {t("hiddenSections")}
                  </span>

                  <ul className="border-sidebar-border flex flex-col gap-0.5 rounded border border-dashed p-0.5">
                    {hiddenGroups.map((group) => (
                      <li
                        key={group.id}
                        className="flex items-center gap-1 rounded px-0.5 py-1 opacity-60"
                      >
                        <span className="flex-1 truncate px-1 text-xs font-medium">
                          {group.name}
                        </span>

                        <span className="text-muted-foreground text-[10px] tabular-nums">
                          {group.items.filter(canSee).length}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            setGroupHidden(group.id, false)
                          }}
                          className="text-muted-foreground size-5"
                          title={t("showSection")}
                        >
                          <icon.Eye className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <HiddenPool
                items={visibleHidden}
                onRestoreItem={restoreItem}
                t={t as unknown as (key: string) => string}
              />

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="default"
                      size="sm"
                      className="hover:text-foreground sticky bottom-0 z-10 text-xs"
                    >
                      <icon.Add className="mr-1 size-3" />
                      {t("add")}
                    </Button>
                  }
                />

                <DropdownMenuContent side="top" align="start">
                  <DropdownMenuItem onClick={addGroup}>
                    <icon.List className="mr-2 size-4" />
                    {t("addGroup")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setShelfEditorState("create")
                    }}
                  >
                    <icon.Bookmark className="mr-2 size-4" />
                    {t("createShelf")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <DragOverlay>
              {(source) => {
                const id = String(source.id)
                const group = state.groups.find((g) => g.id === id)

                return (
                  <div className="bg-sidebar-accent text-sidebar-accent-foreground flex items-center gap-1.5 rounded px-1 py-1.5 shadow-md">
                    <icon.GripVertical className="text-muted-foreground size-3.5" />
                    <span
                      className={cn("truncate text-xs", group && "font-medium")}
                    >
                      {group?.name ?? findItem(state, id)?.name}
                    </span>
                  </div>
                )
              }}
            </DragOverlay>
          </DragDropProvider>
        </SidebarGroupContent>
      </SidebarGroup>

      <ShelfEditor
        open={!!shelfEditorState}
        onOpenChange={(open) => {
          if (!open) {
            setShelfEditorState(null)
          }
        }}
        shelf={
          shelfEditorState && shelfEditorState !== "create"
            ? (userShelves.find((s) => s.uuid === shelfEditorState) ?? null)
            : null
        }
        onSaved={handleShelfSaved}
      />
    </>
  )
}

type EditableGroupProps = {
  group: LocalGroup
  index: number
  items: LocalItem[]
  onRename: (name: string) => void
  onRemoveGroup?: () => void
  onHideGroup: () => void
  onHideItem: (itemId: string) => void
  onEditItem: (item: LocalItem) => void
  t: (key: string) => string
}

function EditableGroup({
  group,
  index,
  items,
  onRename,
  onRemoveGroup,
  onHideGroup,
  onHideItem,
  onEditItem,
  t,
}: EditableGroupProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: group.id,
    index,
    type: SECTION_TYPE,
    accept: [SECTION_TYPE, ITEM_TYPE],
    collisionPriority: CollisionPriority.Low,
  })

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-1",
        isDragging &&
          "border-sidebar-border bg-sidebar-accent/40 rounded border border-dashed opacity-40",
      )}
    >
      <div className="group/section-header flex items-center gap-1">
        <button
          ref={handleRef}
          type="button"
          className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          title={t("moveSection")}
        >
          <icon.GripVertical className="size-3" />
        </button>

        <Input
          value={group.name}
          onChange={(e) => {
            onRename(e.target.value)
          }}
          className="h-6 flex-1 border-none bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-1"
        />

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onHideGroup}
          className="text-muted-foreground size-5"
          title={t("hideSection")}
        >
          <icon.EyeOff className="size-3" />
        </Button>

        {onRemoveGroup && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRemoveGroup}
            className="text-muted-foreground hover:text-destructive size-5"
            title={t("removeSection")}
          >
            <icon.Trash className="size-3" />
          </Button>
        )}
      </div>

      <ul className="flex min-h-6 flex-col gap-0 rounded">
        {items.map((item, itemIndex) => (
          <EditableItem
            key={item.id}
            item={item}
            index={itemIndex}
            container={group.id}
            onHide={() => {
              onHideItem(item.id)
            }}
            onEdit={
              item.kind === "shelf" && item.shelfUuid
                ? () => {
                    onEditItem(item)
                  }
                : undefined
            }
            t={t}
          />
        ))}
      </ul>
    </div>
  )
}

function HiddenPool({
  items,
  onRestoreItem,
  t,
}: {
  items: LocalItem[]
  onRestoreItem: (itemId: string) => void
  t: (key: string) => string
}) {
  const { ref } = useDroppable({
    id: HIDDEN_CONTAINER_ID,
    type: HIDDEN_CONTAINER_ID,
    accept: ITEM_TYPE,
    collisionPriority: CollisionPriority.Low,
  })

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground px-1 text-[10px] font-medium tracking-[0.14em] uppercase">
        {t("hidden")}
      </span>

      <ul
        ref={ref}
        className={cn(
          "border-sidebar-border flex min-h-8 flex-col gap-0.5 rounded border border-dashed p-0.5",
          items.length === 0 && "items-center justify-center",
        )}
      >
        {items.length === 0 && (
          <span className="text-muted-foreground/60 text-[10px]">
            {t("hiddenEmpty")}
          </span>
        )}
        {items.map((item, index) => (
          <EditableItem
            key={item.id}
            item={item}
            index={index}
            container={HIDDEN_CONTAINER_ID}
            hidden
            onRestore={() => {
              onRestoreItem(item.id)
            }}
            t={t}
          />
        ))}
      </ul>
    </div>
  )
}

type EditableItemProps = {
  item: LocalItem
  index: number
  container: string
  hidden?: boolean
  onHide?: () => void
  onRestore?: () => void
  onEdit?: () => void
  t: (key: string) => string
}

function EditableItem({
  item,
  index,
  container,
  hidden = false,
  onHide,
  onRestore,
  onEdit,
  t,
}: EditableItemProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    index,
    type: ITEM_TYPE,
    accept: ITEM_TYPE,
    group: container,
  })

  return (
    <li
      ref={ref}
      className={cn(
        "flex items-center gap-1 rounded px-0.5 py-1",
        isDragging && "bg-sidebar-accent opacity-50",
        hidden && "opacity-60",
      )}
    >
      <button
        ref={handleRef}
        type="button"
        className="text-muted-foreground hover:text-foreground hover:text-sidebar-accent flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <icon.GripVertical className="size-3.5" />
      </button>

      <span className="flex-1 truncate text-xs">{item.name}</span>

      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onEdit}
          className="text-muted-foreground size-5"
          title={t("editItem")}
        >
          <icon.Edit className="size-3" />
        </Button>
      )}

      {onHide && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onHide}
          className="text-muted-foreground size-5"
          title={t("hideFromSidebar")}
        >
          <icon.EyeOff className="size-3" />
        </Button>
      )}

      {onRestore && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRestore}
          className="text-muted-foreground size-5"
          title={t("showInSidebar")}
        >
          <icon.Eye className="size-3" />
        </Button>
      )}
    </li>
  )
}
