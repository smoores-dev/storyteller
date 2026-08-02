"use client"

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"
import { Button } from "@v3/_/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@v3/_/components/ui/collapsible"
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
  items: LocalItem[]
}

type ManagerState = {
  groups: LocalGroup[]
  hidden: LocalItem[]
}

const HIDDEN_CONTAINER_ID = "__hidden__"

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

  // kysely inference loses selectAll fields; the API response has all shelf columns
  const { data: rawShelves = [] } = useListUserShelvesQuery()
  const userShelves = rawShelves as unknown as Array<
    ShelfListItem & ShelfWithBooks
  >

  // "create" means open the editor in create mode; a uuid string means edit that shelf
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
      items: g.items.filter((i) => !i.hidden).map(toLocalItem),
    })),
    hidden: groups.flatMap((g) =>
      g.items.filter((i) => i.hidden).map(toLocalItem),
    ),
  }))

  const [activeItem, setActiveItem] = useState<LocalItem | null>(null)

  // permission-gated builtins stay in the payload untouched but are never
  // shown to a user who can't access them
  const canSee = (item: LocalItem) => {
    if (item.kind !== "builtin" || !item.builtinKey) return true
    const builtin = BUILTIN_SIDEBAR_MAP[item.builtinKey]
    return !builtin?.permission || !!permissions?.[builtin.permission]
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const findContainer = (s: ManagerState, id: string): string | null => {
    if (id === HIDDEN_CONTAINER_ID) return HIDDEN_CONTAINER_ID
    if (s.groups.some((g) => g.id === id)) return id
    if (s.hidden.some((i) => i.id === id)) return HIDDEN_CONTAINER_ID
    return s.groups.find((g) => g.items.some((i) => i.id === id))?.id ?? null
  }

  const findItem = (s: ManagerState, id: string): LocalItem | null =>
    s.hidden.find((i) => i.id === id) ??
    s.groups.flatMap((g) => g.items).find((i) => i.id === id) ??
    null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItem(findItem(state, String(event.active.id)))
  }

  // cross-container preview: moving between groups (or in/out of the hidden
  // pool) happens live while dragging; onDragEnd only settles ordering
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    setState((prev) => {
      const from = findContainer(prev, activeId)
      const to = findContainer(prev, overId)
      if (!from || !to || from === to) return prev

      const item = findItem(prev, activeId)
      if (!item) return prev

      const withoutItem: ManagerState = {
        groups: prev.groups.map((g) => ({
          ...g,
          items: g.items.filter((i) => i.id !== activeId),
        })),
        hidden: prev.hidden.filter((i) => i.id !== activeId),
      }

      if (to === HIDDEN_CONTAINER_ID) {
        return {
          ...withoutItem,
          hidden: [...withoutItem.hidden, item],
        }
      }

      return {
        ...withoutItem,
        groups: withoutItem.groups.map((g) => {
          if (g.id !== to) return g
          const overIndex = g.items.findIndex((i) => i.id === overId)
          const insertAt = overIndex >= 0 ? overIndex : g.items.length
          const items = [...g.items]
          items.splice(insertAt, 0, item)
          return { ...g, items }
        }),
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveItem(null)
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    setState((prev) => {
      const container = findContainer(prev, activeId)
      if (!container || container !== findContainer(prev, overId)) return prev
      if (container === HIDDEN_CONTAINER_ID) return prev

      return {
        ...prev,
        groups: prev.groups.map((g) => {
          if (g.id !== container) return g
          const oldIndex = g.items.findIndex((i) => i.id === activeId)
          const newIndex = g.items.findIndex((i) => i.id === overId)
          if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return g
          return { ...g, items: arrayMove(g.items, oldIndex, newIndex) }
        }),
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

  // restored items land at the end of their default group
  const defaultGroupFor = (s: ManagerState, item: LocalItem) => {
    const kind: SidebarGroupKind =
      item.kind === "collection"
        ? "collections"
        : item.kind === "shelf"
          ? "shelves"
          : builtinGroupFor(item.builtinKey ?? "") ?? "library"

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

  // only custom groups can be removed; their items move to the hidden pool so
  // nothing is lost
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
          items: [],
        },
      ],
    }))
  }

  const handleShelfSaved = (rawSaved: ShelfWithBooks) => {
    // kysely inference loses fields; cast to access runtime properties
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
        // edited: refresh name/icon in place
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
      items: g.items.map((i) => ({
        kind: i.kind,
        builtinKey: i.kind === "builtin" ? i.builtinKey : undefined,
        collectionUuid: i.kind === "collection" ? i.collectionUuid : undefined,
        shelfUuid: i.kind === "shelf" ? i.shelfUuid : undefined,
        hidden: false,
      })),
    }))

    // hidden items ride along in their default group, flagged hidden so the
    // reconciler knows the user said no
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveItem(null)
            }}
          >
            <div className="flex flex-col gap-3 px-1">
              {state.groups.map((group) => (
                <EditableGroup
                  key={group.id}
                  group={group}
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
                  onHideItem={hideItem}
                  onEditItem={(item) => {
                    if (item.kind === "shelf" && item.shelfUuid) {
                      setShelfEditorState(item.shelfUuid)
                    }
                  }}
                  t={t as unknown as (key: string) => string}
                />
              ))}

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
              {activeItem ? (
                <div className="bg-sidebar-accent text-sidebar-accent-foreground flex items-center gap-1.5 rounded px-1 py-1.5 shadow-md">
                  <icon.GripVertical className="text-muted-foreground size-3.5" />
                  <span className="truncate text-xs">{activeItem.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
            ? userShelves.find((s) => s.uuid === shelfEditorState) ?? null
            : null
        }
        onSaved={handleShelfSaved}
      />
    </>
  )
}

type EditableGroupProps = {
  group: LocalGroup
  items: LocalItem[]
  onRename: (name: string) => void
  onRemoveGroup?: () => void
  onHideItem: (itemId: string) => void
  onEditItem: (item: LocalItem) => void
  t: (key: string) => string
}

function EditableGroup({
  group,
  items,
  onRename,
  onRemoveGroup,
  onHideItem,
  onEditItem,
  t,
}: EditableGroupProps) {
  const [isOpen, setIsOpen] = useState(true)
  const { setNodeRef } = useDroppable({ id: group.id })

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <CollapsibleTrigger
            render={
              <Button variant="real-ghost" size="icon-xs" className="size-5">
                <icon.ChevronDown
                  className={cn(
                    "size-3 transition-transform",
                    !isOpen && "-rotate-90",
                    "text-muted-foreground!",
                  )}
                />
              </Button>
            }
          />

          <Input
            value={group.name}
            onChange={(e) => {
              onRename(e.target.value)
            }}
            className="h-6 flex-1 border-none bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-1"
          />

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

        <CollapsibleContent>
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul
              ref={setNodeRef}
              className="flex min-h-6 flex-col gap-0 rounded"
            >
              {items.map((item) => (
                <EditableItem
                  key={item.id}
                  item={item}
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
          </SortableContext>
        </CollapsibleContent>
      </div>
    </Collapsible>
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
  const { setNodeRef } = useDroppable({ id: HIDDEN_CONTAINER_ID })

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground px-1 text-[10px] font-medium tracking-[0.14em] uppercase">
        {t("hidden")}
      </span>

      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
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
          {items.map((item) => (
            <EditableItem
              key={item.id}
              item={item}
              hidden
              onRestore={() => {
                onRestoreItem(item.id)
              }}
              t={t}
            />
          ))}
        </ul>
      </SortableContext>
    </div>
  )
}

type EditableItemProps = {
  item: LocalItem
  hidden?: boolean
  onHide?: () => void
  onRestore?: () => void
  onEdit?: () => void
  t: (key: string) => string
}

function EditableItem({
  item,
  hidden = false,
  onHide,
  onRestore,
  onEdit,
  t,
}: EditableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-1 rounded px-0.5 py-1",
        isDragging && "bg-sidebar-accent opacity-50",
        hidden && "opacity-60",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
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
