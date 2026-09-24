"use client"
"use no memo"

import { Menu } from "@base-ui/react/menu"
import { useVirtualizer } from "@tanstack/react-virtual"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { useOptionalBookListPageState } from "@v3/_/components/books/BookListPage"
import { SearchInput } from "@v3/_/components/books/SearchInput"
import { SelectionCheckbox } from "@v3/_/components/books/SelectionCheckbox"
import {
  EntityCreateDialog,
  useCreateEntity,
} from "@v3/_/components/library/EntityCreateDialog"
import { EntityEditDialog } from "@v3/_/components/library/EntityEditDialog"
import { SidebarEntityActions } from "@v3/_/components/library/SidebarEntityActions"
import {
  type FacetValue,
  type LibraryEntityType,
  NONE_KEY,
} from "@v3/_/components/library/library-sections"
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
import { DynamicIcon } from "@v3/_/components/ui/dynamic-icon"
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@v3/_/components/ui/sidebar"
import { V3Link } from "@v3/_/components/v3-link"
import { type BookFiltersController } from "@v3/_/hooks/use-book-filters"
import { useDeleteEntity } from "@v3/_/hooks/use-delete-entity"
import {
  ESCAPE_PRIORITY,
  useEscapeHandler,
} from "@v3/_/hooks/use-escape-cascade"
import { useItemSelection } from "@v3/_/hooks/use-item-selection"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import { usePinShelf } from "@v3/_/hooks/use-pin-shelf"
import { useSidebarVisibility } from "@v3/_/hooks/use-sidebar-visibility"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { apiErrorMessage } from "@v3/_/lib/api-error"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { type ShelfFilterNode } from "@/shelves"
import { type UUID } from "@/uuid"

const SIDEBAR_ROW_HEIGHT = 32

const REVEAL_ON_HOVER =
  "md:opacity-0 group-hover/menu-item:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100 data-open:opacity-100 data-popup-open:opacity-100"

const HOVER_PREFETCH_DELAY_MS = 50

export type SidebarSortMode = "name" | "count"
export type SidebarSortDirection = "asc" | "desc"

type RowMenuHandle = Menu.Handle<FacetValue>

export function LibrarySidebar({
  title,
  items,
  selectedKey,
  isLoading,
  search,
  onSearchChange,
  sortMode,
  sortDirection,
  onSortChange,
  onItemClick,
  onHoverItem,
  entityType,
  toShelfFilter,
  isItemLocked,
}: {
  title: string
  items: FacetValue[]
  selectedKey: string | null
  isLoading: boolean
  search: string
  onSearchChange: (value: string) => void
  sortMode: SidebarSortMode
  sortDirection: SidebarSortDirection
  onSortChange: (mode: SidebarSortMode, direction: SidebarSortDirection) => void
  onItemClick: (key: string) => void
  onHoverItem?: (key: string, controller?: BookFiltersController) => void
  entityType?: LibraryEntityType | undefined
  toShelfFilter?: ((itemKey: string) => ShelfFilterNode) | undefined
  isItemLocked?: ((item: FacetValue) => boolean) | undefined
}) {
  const t = useTranslation("LibraryPage")
  const tEntity = useTranslation("EntityActions")
  const c = useCommon()

  const itemSelection = useItemSelection()

  useEscapeHandler(
    ESCAPE_PRIORITY.sidebarSelection,
    itemSelection.stopSelecting,
    itemSelection.isSelecting,
  )

  const pageState = useOptionalBookListPageState()
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelHover = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }

  const hoverItem = (key: string) => {
    cancelHover()
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null
      onHoverItem?.(key, pageState?.controller)
    }, HOVER_PREFETCH_DELAY_MS)
  }

  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )

  const [activeKey, setActiveKey] = useState<string | null>(null)
  const highlightedKey =
    activeKey ?? (search.trim() ? (items[0]?.key ?? null) : null)

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (!(event.target instanceof HTMLInputElement)) return

    if (event.key === "Enter") {
      if (!highlightedKey) return
      event.preventDefault()
      onItemClick(highlightedKey)
      return
    }

    const moves: Record<string, (current: number) => number> = {
      ArrowDown: (current) => (current < items.length - 1 ? current + 1 : 0),
      ArrowUp: (current) => (current > 0 ? current - 1 : items.length - 1),
      Home: () => 0,
      End: () => items.length - 1,
    }
    const move = moves[event.key]
    if (!move || items.length === 0) return

    event.preventDefault()
    const current = highlightedKey
      ? items.findIndex((item) => item.key === highlightedKey)
      : -1
    setActiveKey(items[move(current)]?.key ?? null)
  }

  const [rowMenu] = useState<RowMenuHandle>(() =>
    Menu.createHandle<FacetValue>(),
  )

  const deleteEntity = useDeleteEntity(entityType)
  const [deleteTarget, setDeleteTarget] = useState<FacetValue | null>(null)

  const rowDeleteAction = useConfirmAction({
    onConfirm: async () => {
      if (deleteTarget) await deleteEntity(deleteTarget.key as UUID)
    },
    title: tEntity("deleteTitle", {
      count: 1,
      entity: entityType
        ? tEntity(`entityTypes.${entityType}` as "entityTypes.tag", {
            count: 1,
          })
        : "",
    }),
    description: tEntity("deleteDescription"),
    confirmLabel: c("actions.delete"),
    variant: "destructive",
  })

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<FacetValue | null>(null)

  const handleEditItem = (item: FacetValue) => {
    setEditItem(item)
    setEditDialogOpen(true)
  }

  const { canCreate, createLabel } = useCreateEntity(entityType)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { pinShelf } = usePinShelf()

  const sidebarItemKind =
    entityType === "collection"
      ? ("collection" as const)
      : entityType === "shelf"
        ? ("shelf" as const)
        : null
  const {
    isHidden,
    setHidden,
    isSaving: isTogglingVisibility,
  } = useSidebarVisibility()

  const isHiddenInSidebar = (item: FacetValue) =>
    !!sidebarItemKind && item.key !== NONE_KEY && isHidden(item.key)

  const handleToggleSidebarVisibility = (item: FacetValue) => {
    if (!sidebarItemKind) return
    void setHidden(sidebarItemKind, item.key, !isHidden(item.key)).catch(
      (error: unknown) => {
        toast.error(tEntity("sidebarVisibilityFailed"), {
          description: apiErrorMessage(error),
        })
      },
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={setScrollElement}
        className="scroll-y relative flex min-h-0 flex-1 flex-col"
      >
        {/* DONT MAKE FLEX CONTAINER THE SEARCH INPUT WILL NOT BE THE CORRECT HEIGHT IT WILL HAUNT YOU */}
        <div
          className="bg-background sticky top-0 z-10 shrink-0 flex-col px-3 pb-2"
          onKeyDown={handleSearchKeyDown}
        >
          <div className="flex h-(--header-height) items-center justify-between">
            <h2 className={cn("font-heading", "text-base")}>{title}</h2>

            <div className="flex items-center gap-0.5">
              {canCreate && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setCreateDialogOpen(true)
                  }}
                  title={createLabel}
                >
                  <icon.Add className="size-4" />
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm">
                      {sortMode === "name" ? (
                        sortDirection === "asc" ? (
                          <icon.SortAlphabeticalAscending className="size-4" />
                        ) : (
                          <icon.SortAlphabeticalDescending className="size-4" />
                        )
                      ) : sortDirection === "asc" ? (
                        <icon.SortNumericAscending className="size-4" />
                      ) : (
                        <icon.SortNumericDescending className="size-4" />
                      )}
                    </Button>
                  }
                />

                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => {
                      if (sortMode === "name") {
                        onSortChange(
                          "name",
                          sortDirection === "asc" ? "desc" : "asc",
                        )
                      } else {
                        onSortChange("name", "asc")
                      }
                    }}
                  >
                    <icon.SortAlphabeticalAscending className="size-4" />
                    {t("sortByName")}

                    {sortMode === "name" && (
                      <span className="text-muted-foreground text-xs">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => {
                      if (sortMode === "count") {
                        onSortChange(
                          "count",
                          sortDirection === "asc" ? "desc" : "asc",
                        )
                      } else {
                        onSortChange("count", "desc")
                      }
                    }}
                  >
                    <icon.SortNumericAscending className="size-4" />
                    {t("sortByCount")}

                    {sortMode === "count" && (
                      <span className="text-muted-foreground text-xs">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <SearchInput
            placeholder={t("filter")}
            value={search}
            onChange={(value) => {
              onSearchChange(value)
              setActiveKey(null)
            }}
            onBlur={() => {
              setActiveKey(null)
            }}
            className="h-8! shrink-0 rounded-sm rounded-b-none border-0 border-b-1! bg-transparent [&>svg]:hidden"
          />
        </div>

        <SidebarItemList
          items={items}
          scrollElement={scrollElement}
          selectedKey={selectedKey}
          highlightedKey={highlightedKey}
          onItemClick={onItemClick}
          onHoverItem={hoverItem}
          onCancelHover={cancelHover}
          isLoading={isLoading}
          entityType={entityType}
          itemSelection={itemSelection}
          rowMenu={rowMenu}
          isItemLocked={isItemLocked}
          isItemHiddenInSidebar={
            sidebarItemKind ? isHiddenInSidebar : undefined
          }
        />

        <Menu.Root handle={rowMenu}>
          {({ payload: item }) =>
            item ? (
              <DropdownMenuContent align="end" className="min-w-40">
                {entityType && !isItemLocked?.(item) && (
                  <DropdownMenuItem
                    onClick={() => {
                      handleEditItem(item)
                    }}
                  >
                    <icon.Edit className="mr-2 h-4 w-4" />
                    {c("actions.edit")}
                  </DropdownMenuItem>
                )}

                {toShelfFilter && (
                  <DropdownMenuItem
                    onClick={() => {
                      void pinShelf(item.name, toShelfFilter(item.key))
                    }}
                  >
                    <icon.BookmarkPlus className="mr-2 h-4 w-4" />
                    {t("pinAsShelf")}
                  </DropdownMenuItem>
                )}

                {sidebarItemKind && item.key !== NONE_KEY && (
                  <DropdownMenuItem
                    disabled={isTogglingVisibility}
                    onClick={() => {
                      handleToggleSidebarVisibility(item)
                    }}
                  >
                    {isHiddenInSidebar(item) ? (
                      <>
                        <icon.Eye className="mr-2 h-4 w-4" />
                        {tEntity("showInSidebar")}
                      </>
                    ) : (
                      <>
                        <icon.EyeOff className="mr-2 h-4 w-4" />
                        {tEntity("hideFromSidebar")}
                      </>
                    )}
                  </DropdownMenuItem>
                )}

                {entityType && !isItemLocked?.(item) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(event) => {
                        if (event.shiftKey) {
                          void deleteEntity(item.key as UUID)
                          return
                        }
                        setDeleteTarget(item)
                        rowDeleteAction.confirm()
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <icon.Trash className="mr-2 h-4 w-4" />
                      {c("actions.delete")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            ) : null
          }
        </Menu.Root>

        <ConfirmDialog {...rowDeleteAction.dialogProps} />

        {entityType && (
          <EntityEditDialog
            entityType={entityType}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            item={editItem}
          />
        )}

        {canCreate && entityType && (
          <EntityCreateDialog
            entityType={entityType}
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
          />
        )}
      </div>

      {entityType && entityType !== "status" && (
        <SidebarEntityActions
          entityType={entityType}
          selectedItems={itemSelection.selectedItems}
          allItems={items}
          onStopSelecting={itemSelection.stopSelecting}
          onEdit={handleEditItem}
          toShelfFilter={toShelfFilter}
          isItemLocked={isItemLocked}
        />
      )}
    </div>
  )
}

function SidebarItemList({
  items,
  scrollElement,
  selectedKey,
  highlightedKey,
  onItemClick,
  onHoverItem,
  onCancelHover,
  isLoading,
  entityType,
  itemSelection,
  rowMenu,
  isItemLocked,
  isItemHiddenInSidebar,
}: {
  items: FacetValue[]
  scrollElement: HTMLElement | null
  selectedKey: string | null
  highlightedKey: string | null
  onItemClick: (key: string) => void
  onHoverItem: (key: string) => void
  onCancelHover: () => void
  isLoading: boolean
  entityType?: LibraryEntityType | undefined
  itemSelection: ReturnType<typeof useItemSelection>
  rowMenu: RowMenuHandle
  isItemLocked?: ((item: FacetValue) => boolean) | undefined
  isItemHiddenInSidebar?: ((item: FacetValue) => boolean) | undefined
}) {
  const c = useCommon()
  const { isSelecting } = itemSelection
  const canSelect = !!entityType
  const hasRowActions = !!entityType

  const [scrollMargin, setScrollMargin] = useState(0)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => SIDEBAR_ROW_HEIGHT + 1,
    overscan: 15,
    scrollMargin,
  })

  const highlightedIndex = highlightedKey
    ? items.findIndex((item) => item.key === highlightedKey)
    : -1

  useEffect(() => {
    if (highlightedIndex >= 0) {
      virtualizer.scrollToIndex(highlightedIndex, { align: "auto" })
    }
  }, [highlightedIndex, virtualizer])

  if (isLoading) {
    const widths = [60, 45, 72, 50, 38, 65, 55, 42, 68, 48, 58, 44]

    return (
      <SidebarMenu className="gap-0.5 px-2 py-1">
        {widths.map((w, i) => (
          <SidebarMenuItem
            key={i}
            className="flex h-8 items-center justify-between"
          >
            <div
              className="bg-muted/60 h-4 animate-pulse rounded"
              style={{ width: `${w}%` }}
            />
            <div className="bg-muted/40 h-4 w-6 animate-pulse rounded-full" />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground px-4 py-8 text-center text-sm">
        {c("empty.noItemsFound")}
      </div>
    )
  }

  return (
    <SidebarMenu
      ref={(node) => {
        if (node) setScrollMargin(node.offsetTop)
      }}
      className="relative shrink-0 gap-0 px-2 py-1"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index]
        if (!item) return null

        return (
          <SidebarRow
            key={item.key}
            item={item}
            style={{
              height: virtualItem.size,
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
            isActive={item.key === selectedKey}
            isHighlighted={item.key === highlightedKey}
            isChecked={itemSelection.isSelected(item.key)}
            isSelecting={isSelecting}
            isLocked={isItemLocked?.(item) ?? false}
            isHiddenInSidebar={isItemHiddenInSidebar?.(item) ?? false}
            canSelect={canSelect && item.key !== NONE_KEY}
            hasRowActions={hasRowActions && item.key !== NONE_KEY}
            rowMenu={rowMenu}
            onItemClick={onItemClick}
            onHover={onHoverItem}
            onHoverLeave={onCancelHover}
            onToggle={itemSelection.toggleItem}
            onSelectRange={(key) => {
              itemSelection.selectRange(
                key,
                items.map((i) => i.key),
              )
            }}
          />
        )
      })}
    </SidebarMenu>
  )
}

function SidebarRow({
  item,
  style,
  isActive,
  isHighlighted,
  isChecked,
  isSelecting,
  isLocked,
  isHiddenInSidebar,
  canSelect,
  hasRowActions,
  rowMenu,
  onItemClick,
  onHover,
  onHoverLeave,
  onToggle,
  onSelectRange,
}: {
  item: FacetValue
  style: React.CSSProperties
  isActive: boolean
  isHighlighted: boolean
  isChecked: boolean
  isSelecting: boolean
  isLocked: boolean
  isHiddenInSidebar: boolean
  canSelect: boolean
  hasRowActions: boolean
  rowMenu: RowMenuHandle
  onItemClick: (key: string) => void
  onHover: (key: string) => void
  onHoverLeave: () => void
  onToggle: (key: string) => void
  onSelectRange: (key: string) => void
}) {
  const pathname = usePathname()
  const firstPathSegment = pathname.split("/")[1]
  const { selectedBookUuid } = useBookInSidePanel()
  const tEntity = useTranslation("EntityActions")
  const tIssues = useTranslation("ShelfFilterIssues")
  const hiddenLabel = tEntity.plain("hiddenFromSidebar")
  const issuesLabel = tIssues.plain("shelfBroken")

  if (!firstPathSegment) return null

  const revealsOnHover = hasRowActions || canSelect

  return (
    <SidebarMenuItem className="absolute top-0 left-0 w-full" style={style}>
      <SidebarMenuButton
        isActive={isActive}
        data-highlighted={isHighlighted || undefined}
        className={cn(
          "hover:text-facet-accent-foreground active:text-facet-accent-foreground data-active:text-facet-accent-foreground data-highlighted:bg-sidebar-accent/50 data-highlighted:text-facet-accent-foreground rounded-sm",
          canSelect ? "pr-2 pl-1.5" : "px-2",
        )}
        render={
          <V3Link
            href={`/${firstPathSegment}?item=${item.key}${selectedBookUuid ? `&book=${selectedBookUuid}` : ""}`}
            onPointerEnter={() => {
              onHover(item.key)
            }}
            onPointerLeave={onHoverLeave}
            onClick={(e) => {
              e.preventDefault()
              if (canSelect && e.shiftKey) {
                window.getSelection()?.empty()
                onSelectRange(item.key)
                return
              }

              if (isSelecting && canSelect) {
                onToggle(item.key)
                return
              }

              onItemClick(item.key)
            }}
          >
            {item.icon ? (
              <DynamicIcon
                iconId={item.icon}
                color={item.color}
                className="size-4 shrink-0"
              />
            ) : item.color ? (
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            ) : null}
            <span className="min-w-0 truncate">{item.name}</span>

            {item.filterIssues && item.filterIssues.length > 0 && (
              <icon.AlertTriangle
                className="text-destructive size-3 shrink-0"
                aria-label={issuesLabel}
              />
            )}

            {isLocked && (
              <icon.Lock className="text-muted-foreground/60 size-3 shrink-0" />
            )}

            {isHiddenInSidebar && (
              <icon.EyeOff
                className="text-muted-foreground/60 size-3 shrink-0"
                aria-label={hiddenLabel}
              />
            )}
          </V3Link>
        }
      />

      {hasRowActions && !isSelecting && (
        <Menu.Trigger
          handle={rowMenu}
          payload={item}
          render={
            <SidebarMenuAction
              className={cn(
                "text-muted-foreground hover:text-foreground",
                canSelect && "right-9",
                REVEAL_ON_HOVER,
              )}
            />
          }
        >
          <icon.DotsVertical className="size-3.5" />
        </Menu.Trigger>
      )}

      {canSelect && (
        <SelectionCheckbox
          showCheckbox
          checked={isChecked}
          onSelectRange={onSelectRange}
          onToggle={onToggle}
          uuid={item.key as UUID}
          isSelecting={isSelecting}
          className={cn(
            "absolute top-1.5 right-3",
            "group-hover/menu-item:block! group-hover/menu-item:opacity-100! group-has-[:focus-visible]/menu-item:block! group-has-[:focus-visible]/menu-item:opacity-100!",
            !isSelecting && "hidden",
          )}
        />
      )}

      <SidebarMenuBadge
        className={cn(
          "text-muted-foreground peer-hover/menu-button:text-muted-foreground peer-data-active/menu-button:text-facet-accent-foreground/80 rounded-full px-1.5 text-xs",
          isSelecting && "hidden",
          revealsOnHover &&
            !isSelecting &&
            "group-hover/menu-item:hidden group-has-[:focus-visible]/menu-item:hidden",
        )}
      >
        {item.bookCount}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  )
}
